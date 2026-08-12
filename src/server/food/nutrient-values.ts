import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "../db";
import { nutrientValues } from "../db/schema";
import type { NutrientCode, NutrientUnit } from "./nutrient-codes";

export interface FoodNutrientRow {
  readonly code: NutrientCode;
  readonly value: string;
  readonly unit: NutrientUnit;
}

/**
 * Makes a food's `database`-provenance nutrient rows match `nutrients`
 * exactly — used by every path that writes a food from a source dataset (the
 * OFF pre-warm, the CoFID load, and resolveFood's live-hit write-back).
 *
 * The prune matters as much as the upsert: a refresh against a newer OFF
 * dump or CoFID export can legitimately *drop* a nutrient a previous run
 * stored, and upsert-only would leave that superseded row behind for cache
 * reads to keep serving. Rows this app didn't source from a database (a
 * user correction, a label extraction) are left alone.
 */
export const writeFoodNutrients = async (
  foodId: string,
  nutrients: ReadonlyArray<FoodNutrientRow>,
): Promise<void> => {
  // One row at a time rather than a single batched insert: each nutrient
  // needs its own `excluded`-referencing upsert against the (foodId, code)
  // unique index, and a batched insert can't express a different `set`
  // per conflicting row.
  for (const nutrient of nutrients) {
    await db
      .insert(nutrientValues)
      .values({
        foodId,
        code: nutrient.code,
        value: nutrient.value,
        unit: nutrient.unit,
        provenance: "database",
      })
      .onConflictDoUpdate({
        target: [nutrientValues.foodId, nutrientValues.code],
        targetWhere: sql`${nutrientValues.foodId} is not null`,
        set: {
          value: sql`excluded.value`,
          unit: sql`excluded.unit`,
        },
      });
  }

  const keptCodes = nutrients.map((nutrient) => nutrient.code);
  await db
    .delete(nutrientValues)
    .where(
      and(
        eq(nutrientValues.foodId, foodId),
        eq(nutrientValues.provenance, "database"),
        keptCodes.length === 0
          ? undefined
          : notInArray(nutrientValues.code, keptCodes),
      ),
    );
};
