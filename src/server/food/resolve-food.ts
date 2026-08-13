import { eq, ilike, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";
import { db } from "../db";
import { foods, nutrientValues } from "../db/schema";
import { FoodNotFoundError, type RateLimitExceededError } from "./errors";
import { writeFoodNutrients } from "./nutrient-values";
import { FoodLookupRateLimiter } from "./rate-limiter";
import { OffLiveClient, type OffLiveHit } from "./off-client";

export interface ResolvedFood {
  readonly food: typeof foods.$inferSelect;
  readonly nutrientValues: ReadonlyArray<typeof nutrientValues.$inferSelect>;
}

const MAX_RESULTS = 20;

const searchCache = (
  query: string,
): Effect.Effect<ResolvedFood[]> =>
  Effect.tryPromise(async () => {
    // Ordered, not just limited: without it Postgres gives no row-order
    // guarantee, so a caller reading matches[0] as "the" match (issue #46's
    // happy path, ahead of #50's ambiguity picker) could get a different food
    // for the same query on different requests.
    const matches = await db
      .select()
      .from(foods)
      .where(ilike(foods.name, `%${query}%`))
      .orderBy(foods.createdAt, foods.id)
      .limit(MAX_RESULTS);

    if (matches.length === 0) return [];

    const foodIds = matches.map((food) => food.id);
    const values = await db
      .select()
      .from(nutrientValues)
      .where(inArray(nutrientValues.foodId, foodIds));

    return matches.map((food) => ({
      food,
      nutrientValues: values.filter((value) => value.foodId === food.id),
    }));
  }).pipe(Effect.orDie);

const cacheLiveHit = (
  hit: OffLiveHit,
): Effect.Effect<ResolvedFood> =>
  Effect.tryPromise(async () =>
    // One transaction for the food, its nutrients, and the read-back: a
    // half-written cache entry (food metadata with no nutrients, or new
    // metadata over the previous profile) would be served to every later
    // query for this food until some future live hit happened to repair it.
    db.transaction(async (tx) => {
      const [food] = await tx
        .insert(foods)
        .values({
          name: hit.name,
          brand: hit.brand,
          provenance: "off",
          externalId: hit.externalId,
          basisUnit: hit.basisUnit,
          servingSize: hit.servingSize,
        })
        .onConflictDoUpdate({
          target: [foods.provenance, foods.externalId],
          targetWhere: sql`${foods.externalId} is not null`,
          set: {
            name: hit.name,
            brand: hit.brand,
            basisUnit: hit.basisUnit,
            servingSize: hit.servingSize,
            updatedAt: new Date(),
          },
        })
        .returning();

      await writeFoodNutrients(tx, food.id, hit.nutrients);

      const values = await tx
        .select()
        .from(nutrientValues)
        .where(eq(nutrientValues.foodId, food.id));

      return { food, nutrientValues: values };
    }),
  ).pipe(Effect.orDie);

/**
 * The description-path food resolution layer (issue #44): search the local
 * cache (OFF pre-warm + CoFID + anything a prior live lookup already wrote
 * back) first, and only ever go further when that comes up empty. The
 * live-miss path is rate-limited and, when it does find something, writes it
 * into the cache so the same query never needs a second live call.
 */
export const resolveFood = (
  query: string,
): Effect.Effect<
  ResolvedFood[],
  FoodNotFoundError | RateLimitExceededError,
  FoodLookupRateLimiter | OffLiveClient
> =>
  Effect.gen(function* () {
    const cached = yield* searchCache(query);
    if (cached.length > 0) return cached;

    const rateLimiter = yield* FoodLookupRateLimiter;
    yield* rateLimiter.checkAndConsume;

    const offClient = yield* OffLiveClient;
    const hits = yield* offClient
      .search(query)
      .pipe(Effect.catchTag("OffLiveSearchError", () => Effect.succeed([])));

    if (hits.length === 0) {
      return yield* Effect.fail(new FoodNotFoundError({ query }));
    }

    return yield* Effect.forEach(hits, cacheLiveHit);
  });
