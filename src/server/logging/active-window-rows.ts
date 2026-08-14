import { Effect } from "effect";
import { and, eq, gte, inArray, or } from "drizzle-orm";
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
 * every logged item within `windowStart..now`, joined to its food, plus an
 * itemId -> nutrient rows map for scaling (an item-level correction's own
 * nutrients if it has any, else its food's — see correct-label-photo.ts).
 * Excludes rows superseded by a correction (schema.ts's correctedFromId).
 */
export const loadActiveWindowRows = (
  db: typeof Db,
  windowStart: Date,
  userId: string,
): Effect.Effect<{
  readonly rows: ReadonlyArray<ActiveWindowRow>;
  readonly nutrientsByItemId: ReadonlyMap<string, NutrientRow[]>;
}> =>
  Effect.gen(function* () {
    const rows = yield* Effect.tryPromise(() =>
      db
        .select({
          entryId: diaryEntries.id,
          loggedAt: diaryEntries.loggedAt,
          itemId: loggedItems.id,
          itemCreatedAt: loggedItems.createdAt,
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
        .where(and(gte(diaryEntries.loggedAt, windowStart), eq(diaryEntries.userId, userId))),
    ).pipe(Effect.orDie);

    // Every original with at least one replacement is superseded; among
    // replacements sharing the same original, all but the newest are too.
    const replacementsByOriginalId = new Map<string, typeof rows>();
    for (const row of rows) {
      if (row.correctedFromId === null) continue;
      const bucket = replacementsByOriginalId.get(row.correctedFromId) ?? [];
      bucket.push(row);
      replacementsByOriginalId.set(row.correctedFromId, bucket);
    }
    const supersededIds = new Set<string>();
    for (const [originalId, replacements] of replacementsByOriginalId) {
      supersededIds.add(originalId);
      const newest = replacements.reduce((a, b) =>
        a.itemCreatedAt > b.itemCreatedAt ? a : b,
      );
      for (const replacement of replacements) {
        if (replacement.itemId !== newest.itemId) supersededIds.add(replacement.itemId);
      }
    }

    const activeRows: ActiveWindowRow[] = rows
      .filter((row) => !supersededIds.has(row.itemId))
      .map((row) => ({
        ...row,
        servingSize: row.servingSize === null ? null : Number(row.servingSize),
        quantity: Number(row.quantity),
      }));

    const foodIds = [...new Set(activeRows.map((row) => row.foodId))];
    const itemIds = activeRows.map((row) => row.itemId);
    const nutrientRows = foodIds.length
      ? yield* Effect.tryPromise(() =>
          db
            .select()
            .from(nutrientValues)
            .where(
              or(inArray(nutrientValues.foodId, foodIds), inArray(nutrientValues.loggedItemId, itemIds)),
            ),
        ).pipe(Effect.orDie)
      : [];

    // nutrient_values attaches to exactly one of food_id / logged_item_id
    // (schema.ts's exactly-one-parent check).
    const nutrientsByFoodId = new Map<string, NutrientRow[]>();
    const overridesByItemId = new Map<string, NutrientRow[]>();
    for (const n of nutrientRows) {
      const value = { code: n.code, value: Number(n.value) };
      if (n.loggedItemId !== null) {
        const bucket = overridesByItemId.get(n.loggedItemId) ?? [];
        bucket.push(value);
        overridesByItemId.set(n.loggedItemId, bucket);
      } else if (n.foodId !== null) {
        const bucket = nutrientsByFoodId.get(n.foodId) ?? [];
        bucket.push(value);
        nutrientsByFoodId.set(n.foodId, bucket);
      }
    }

    // Resolve per row: an item's own correction wins over its food's nutrients.
    const nutrientsByItemId = new Map<string, NutrientRow[]>(
      activeRows.map((row) => [
        row.itemId,
        overridesByItemId.get(row.itemId) ?? nutrientsByFoodId.get(row.foodId) ?? [],
      ]),
    );

    return { rows: activeRows, nutrientsByItemId };
  });
