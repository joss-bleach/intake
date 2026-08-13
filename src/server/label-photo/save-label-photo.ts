import type { db as Db } from "../db";
import { diaryEntries, foods, loggedItems, nutrientValues } from "../db/schema";
import type { ParsedLabelReading } from "../../ai/schemas";
import { anyFieldNeedsReview } from "../../ai/label-reading";

type DbClient = typeof Db;

export interface ConfirmedAmount {
  readonly quantity: number;
  readonly quantityUnit: "g" | "ml" | "serving";
}

export interface SavedLabelPhotoEntry {
  readonly diaryEntryId: string;
  readonly foodId: string;
  readonly loggedItemId: string;
}

/**
 * Writes a label-scanned reading straight to a new `Food` (issue #47) —
 * food-database resolution (`resolveFood`, issue #44) is deliberately never
 * called on this path: ADR 0001's "the printed panel already is the fact"
 * means there's nothing to look up. One transaction covers the food, its
 * per-100(g|ml) nutrient rows, the diary entry, and its one logged item, so
 * a failure partway through can't leave any of them committed alone.
 *
 * The logged item's `confidence` is the reading's fields rolled up via
 * `anyFieldNeedsReview` — a normal success state, per ADR 0001, that is
 * saved and visible but never blocks this write.
 */
export const saveLabelPhotoEntry = (
  db: DbClient,
  reading: ParsedLabelReading,
  amount: ConfirmedAmount,
): Promise<SavedLabelPhotoEntry> =>
  db.transaction(async (tx) => {
    const [food] = await tx
      .insert(foods)
      .values({
        name: reading.foodName,
        brand: reading.brand?.value ?? null,
        provenance: "label_extraction",
        basisUnit: reading.basisUnit,
        servingSize:
          reading.servingSize?.value != null ? String(reading.servingSize.value) : null,
      })
      .returning();

    if (!food) {
      throw new Error("Insert into foods returned no row.");
    }

    await tx.insert(nutrientValues).values(
      reading.nutrients.map((nutrient) => ({
        foodId: food.id,
        code: nutrient.code,
        value: String(nutrient.value),
        unit: nutrient.unit,
        provenance: "label_extraction" as const,
        confidence: nutrient.confidence,
      })),
    );

    const [entry] = await tx
      .insert(diaryEntries)
      .values({ entryMethod: "label_photo" })
      .returning();

    if (!entry) {
      throw new Error("Insert into diary_entries returned no row.");
    }

    const [item] = await tx
      .insert(loggedItems)
      .values({
        diaryEntryId: entry.id,
        foodId: food.id,
        quantity: String(amount.quantity),
        quantityUnit: amount.quantityUnit,
        confidence: anyFieldNeedsReview(reading) ? "needs_review" : "confident",
      })
      .returning();

    if (!item) {
      throw new Error("Insert into logged_items returned no row.");
    }

    return { diaryEntryId: entry.id, foodId: food.id, loggedItemId: item.id };
  });
