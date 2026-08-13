import { Effect } from "effect";
import { eq, gte, inArray } from "drizzle-orm";
import type { db as Db } from "../db";
import { diaryEntries, foods, loggedItems, nutrientValues } from "../db/schema";
import type { NutrientRow } from "../food/nutrient-scaling";

export interface ActiveWindowRow {
  readonly entryId: string;
  readonly loggedAt: Date;
  readonly itemId: string;
  readonly foodId: string;
  readonly foodName: string;
  readonly servingSize: number | null;
  readonly quantity: number;
  readonly quantityUnit: "g" | "ml" | "serving";
  readonly confidence: "confident" | "needs_review" | null;
}

/**
 * The join + supersession-filter shared by dashboard.ts and insights.ts:
 * every logged item within `windowStart..now`, joined to its food, plus a
 * foodId -> nutrient rows map for scaling. Excludes rows superseded by a
 * correction (schema.ts's correctedFromId) — a no-op today since #50's
 * write path doesn't exist yet, but not dead logic.
 */
export const loadActiveWindowRows = (
  db: typeof Db,
  windowStart: Date,
): Effect.Effect<{
  readonly rows: ReadonlyArray<ActiveWindowRow>;
  readonly nutrientsByFoodId: ReadonlyMap<string, NutrientRow[]>;
}> =>
  Effect.gen(function* () {
    const rows = yield* Effect.tryPromise(() =>
      db
        .select({
          entryId: diaryEntries.id,
          loggedAt: diaryEntries.loggedAt,
          itemId: loggedItems.id,
          foodId: loggedItems.foodId,
          foodName: foods.name,
          servingSize: foods.servingSize,
          quantity: loggedItems.quantity,
          quantityUnit: loggedItems.quantityUnit,
          confidence: loggedItems.confidence,
          correctedFromId: loggedItems.correctedFromId,
        })
        .from(diaryEntries)
        .innerJoin(loggedItems, eq(loggedItems.diaryEntryId, diaryEntries.id))
        .innerJoin(foods, eq(loggedItems.foodId, foods.id))
        .where(gte(diaryEntries.loggedAt, windowStart)),
    ).pipe(Effect.orDie);

    const foodIds = [...new Set(rows.map((row) => row.foodId))];
    const nutrientRows = foodIds.length
      ? yield* Effect.tryPromise(() =>
          db.select().from(nutrientValues).where(inArray(nutrientValues.foodId, foodIds)),
        ).pipe(Effect.orDie)
      : [];
    const nutrientsByFoodId = new Map<string, NutrientRow[]>();
    for (const n of nutrientRows) {
      // nutrient_values.food_id is nullable in general (a row can instead
      // attach to a logged_item — schema.ts's exactly-one-parent check), but
      // this query filtered to foodIds, so it's never null here.
      if (n.foodId === null) continue;
      const bucket = nutrientsByFoodId.get(n.foodId) ?? [];
      bucket.push({ code: n.code, value: Number(n.value) });
      nutrientsByFoodId.set(n.foodId, bucket);
    }

    const supersededIds = new Set(
      rows.map((row) => row.correctedFromId).filter((id): id is string => id !== null),
    );
    const activeRows: ActiveWindowRow[] = rows
      .filter((row) => !supersededIds.has(row.itemId))
      .map((row) => ({
        ...row,
        servingSize: row.servingSize === null ? null : Number(row.servingSize),
        quantity: Number(row.quantity),
      }));

    return { rows: activeRows, nutrientsByFoodId };
  });
