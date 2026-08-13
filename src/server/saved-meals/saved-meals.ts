import { Data, Effect } from "effect";
import { eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  diaryEntries,
  foods,
  loggedItems,
  savedMealItems,
  savedMeals,
} from "../db/schema";

type QuantityUnit = "g" | "ml" | "serving";

export class SavedMealNotFoundError extends Data.TaggedError(
  "SavedMealNotFoundError",
)<{
  readonly savedMealId: string;
}> {
  readonly code = "NOT_FOUND" as const;

  get message() {
    return "That saved meal no longer exists.";
  }
}

// The two suggestion sources search merges into one ranked list (issue #52):
// a food re-derived from logging history (no explicit save) and a
// deliberately named, multi-item SavedMeal. `type` is how the client tells
// them apart — a recently-logged suggestion re-logs one food directly, a
// saved meal re-logs all its items via `relog`.
export interface RecentlyLoggedSuggestion {
  readonly type: "recently_logged";
  readonly foodId: string;
  readonly name: string;
  readonly timesLogged: number;
  readonly lastLoggedAt: string;
}

export interface SavedMealSuggestion {
  readonly type: "saved_meal";
  readonly savedMealId: string;
  readonly name: string;
  readonly timesLogged: number;
  readonly lastLoggedAt: string | null;
}

export type Suggestion = RecentlyLoggedSuggestion | SavedMealSuggestion;

// "surfaces first" ranking (issue #52's acceptance criteria): more-frequently
// logged first, ties broken by more-recently logged. A saved meal never
// logged yet (lastLoggedAt null) sorts after any item that has been.
const rankSuggestions = (a: Suggestion, b: Suggestion): number => {
  if (a.timesLogged !== b.timesLogged) return b.timesLogged - a.timesLogged;
  if (a.lastLoggedAt === b.lastLoggedAt) return 0;
  if (a.lastLoggedAt === null) return 1;
  if (b.lastLoggedAt === null) return -1;
  return a.lastLoggedAt < b.lastLoggedAt ? 1 : -1;
};

/**
 * Search over logging history (issue #52): every past `logged_items` row is
 * covered, grouped by `food_id` into one "recently logged" suggestion per
 * food, merged with named `SavedMeal`s. Both are optionally filtered by
 * `query` (case-insensitive substring on name) and ranked by
 * times-logged/last-logged-at together, so whichever is used more often
 * surfaces first regardless of source.
 */
export const searchSuggestionsEffect = (
  query: string | undefined,
): Effect.Effect<ReadonlyArray<Suggestion>> =>
  Effect.gen(function* () {
    // Escape ILIKE's own wildcards (%, _) in the user's text so e.g. a
    // search for "50% Fat" matches that literal name instead of "%"
    // matching any run of characters.
    const namePattern = query
      ? `%${query.replaceAll(/[\\%_]/g, (char) => `\\${char}`)}%`
      : null;

    // Independent queries — run concurrently rather than one-after-the-other.
    const [recentlyLoggedRows, savedMealRows] = yield* Effect.tryPromise(() =>
      Promise.all([
        db
          .select({
            foodId: loggedItems.foodId,
            name: foods.name,
            timesLogged: sql<number>`count(*)::int`,
            lastLoggedAt: sql<string>`max(${diaryEntries.loggedAt})`,
          })
          .from(loggedItems)
          .innerJoin(diaryEntries, eq(loggedItems.diaryEntryId, diaryEntries.id))
          .innerJoin(foods, eq(loggedItems.foodId, foods.id))
          .where(namePattern ? ilike(foods.name, namePattern) : undefined)
          .groupBy(loggedItems.foodId, foods.name),
        db
          .select()
          .from(savedMeals)
          .where(namePattern ? ilike(savedMeals.name, namePattern) : undefined),
      ]),
    ).pipe(Effect.orDie);

    const recentlyLogged: Suggestion[] = recentlyLoggedRows.map((row) => ({
      type: "recently_logged",
      foodId: row.foodId,
      name: row.name,
      timesLogged: row.timesLogged,
      lastLoggedAt: new Date(row.lastLoggedAt).toISOString(),
    }));

    const savedMealSuggestions: Suggestion[] = savedMealRows.map((row) => ({
      type: "saved_meal",
      savedMealId: row.id,
      name: row.name,
      timesLogged: row.timesLogged,
      lastLoggedAt: row.lastLoggedAt ? row.lastLoggedAt.toISOString() : null,
    }));

    return [...recentlyLogged, ...savedMealSuggestions].sort(rankSuggestions);
  });

export interface SavedMealItemInput {
  readonly foodId: string;
  readonly quantity: number;
  readonly quantityUnit: QuantityUnit;
}

export interface SavedMealItemSnapshot extends SavedMealItemInput {
  readonly id: string;
  readonly foodName: string;
}

export interface SavedMealSnapshot {
  readonly id: string;
  readonly name: string;
  readonly timesLogged: number;
  readonly lastLoggedAt: string | null;
  readonly items: ReadonlyArray<SavedMealItemSnapshot>;
}

/**
 * Creates a named, multi-item SavedMeal from already-known foods (issue
 * #52) — the items themselves aren't re-validated against logging history;
 * they're whatever the client gathered from prior logged/scanned items.
 */
export const createSavedMealEffect = (input: {
  readonly name: string;
  readonly items: ReadonlyArray<SavedMealItemInput>;
}): Effect.Effect<SavedMealSnapshot> =>
  Effect.tryPromise(() =>
    db.transaction(async (tx) => {
      const [meal] = await tx
        .insert(savedMeals)
        .values({ name: input.name })
        .returning();

      const itemRows = await tx
        .insert(savedMealItems)
        .values(
          input.items.map((item) => ({
            savedMealId: meal.id,
            foodId: item.foodId,
            quantity: String(item.quantity),
            quantityUnit: item.quantityUnit,
          })),
        )
        .returning();

      const foodRows = await tx
        .select()
        .from(foods)
        .where(inArray(foods.id, itemRows.map((item) => item.foodId)));
      const foodNameById = new Map(foodRows.map((food) => [food.id, food.name]));

      return {
        id: meal.id,
        name: meal.name,
        timesLogged: meal.timesLogged,
        lastLoggedAt: meal.lastLoggedAt ? meal.lastLoggedAt.toISOString() : null,
        items: itemRows.map((item) => ({
          id: item.id,
          foodId: item.foodId,
          foodName: foodNameById.get(item.foodId) ?? "",
          quantity: Number(item.quantity),
          quantityUnit: item.quantityUnit,
        })),
      };
    }),
  ).pipe(Effect.orDie);

export interface RelogResult {
  readonly diaryEntryId: string;
}

/**
 * Re-logs every item of a SavedMeal in one action (issue #52): one new
 * `diary_entries` row (entryMethod "saved_meal") fans out to one
 * `logged_items` row per saved item, and the meal's own `times_logged`/
 * `last_logged_at` are bumped in the same transaction — the counters the
 * search ranking above reads.
 */
export const relogSavedMealEffect = (
  savedMealId: string,
): Effect.Effect<RelogResult, SavedMealNotFoundError> =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise(() =>
      db.transaction(async (tx) => {
        const [meal] = await tx
          .select({ id: savedMeals.id })
          .from(savedMeals)
          .where(eq(savedMeals.id, savedMealId));
        if (!meal) return null;

        const items = await tx
          .select()
          .from(savedMealItems)
          .where(eq(savedMealItems.savedMealId, savedMealId));

        const [entry] = await tx
          .insert(diaryEntries)
          .values({ entryMethod: "saved_meal" })
          .returning();

        if (items.length > 0) {
          await tx.insert(loggedItems).values(
            items.map((item) => ({
              diaryEntryId: entry.id,
              foodId: item.foodId,
              quantity: item.quantity,
              quantityUnit: item.quantityUnit,
            })),
          );
        }

        // Increments in SQL, not off a value read earlier in this
        // transaction — two concurrent relogs of the same meal would
        // otherwise both compute the same "current + 1" and one increment
        // would be lost.
        await tx
          .update(savedMeals)
          .set({
            timesLogged: sql`${savedMeals.timesLogged} + 1`,
            lastLoggedAt: entry.loggedAt,
          })
          .where(eq(savedMeals.id, savedMealId));

        return { diaryEntryId: entry.id };
      }),
    ).pipe(Effect.orDie);

    if (!result) return yield* Effect.fail(new SavedMealNotFoundError({ savedMealId }));
    return result;
  });
