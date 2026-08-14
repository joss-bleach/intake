import { and, eq, sql } from "drizzle-orm";
import type { db as Db } from "../db";
import { diaryEntries, foods, loggedItems, nutrientValues } from "../db/schema";
import type { ParsedLabelReading } from "../../ai/schemas";
import { anyFieldNeedsReview } from "../../ai/label-reading";
import type { ConfirmedAmount } from "./save-label-photo";

type DbClient = typeof Db;

export interface CorrectLabelPhotoInstanceInput {
  // The only target the caller names — the diary entry and food the
  // correction belongs to are read off this row rather than passed
  // alongside it, so three IDs can't arrive describing three unrelated
  // records.
  readonly originalLoggedItemId: string;
  readonly reading: ParsedLabelReading;
  readonly amount: ConfirmedAmount;
  // Nutrient codes the user actually edited this correction — everything
  // else in `reading.nutrients` rides along unchanged from the original
  // extraction and must keep its own confidence/provenance, not be
  // reattributed to the user just because it shares a row with something
  // that was.
  readonly editedNutrientCodes: readonly string[];
}

/**
 * Instance-level correction (issue #51, "just this log"): the additive
 * pattern ADR 0001 lays out for a user correction — a new `logged_items` row
 * pointing back at the original via `corrected_from_id`, the original left
 * untouched for the audit trail (and the eval corrections queue, #48). The
 * corrected nutrient values attach to the *new logged item*, not the shared
 * `foods` row — nutrient_values' exactly-one-parent constraint exists for
 * precisely this: a correction scoped to one log shouldn't move the shared
 * Food everyone else's history still points at.
 *
 * The new row still needs a complete nutrient set (it's a standalone
 * NutritionFact record, same shape as the original save) — only the
 * *provenance* per nutrient differs by whether its code is in
 * `editedNutrientCodes`; confidence always comes from the reading itself,
 * which already reflects the edit (reducer.ts's EDIT_NUTRIENT only flips the
 * touched field's confidence, leaving the rest as extracted).
 */
export const correctLabelPhotoInstance = (
  db: DbClient,
  input: CorrectLabelPhotoInstanceInput,
  userId: string,
): Promise<{ readonly loggedItemId: string }> =>
  db.transaction(async (tx) => {
    // Joined to diaryEntries so an id owned by another user throws the same
    // "not found" error as a missing one (#89) — no separate forbidden case.
    const [originalRow] = await tx
      .select({ item: loggedItems })
      .from(loggedItems)
      .innerJoin(diaryEntries, eq(loggedItems.diaryEntryId, diaryEntries.id))
      .where(
        and(eq(loggedItems.id, input.originalLoggedItemId), eq(diaryEntries.userId, userId)),
      );
    const original = originalRow?.item;

    if (!original) {
      throw new Error("No logged item to correct.");
    }

    const [item] = await tx
      .insert(loggedItems)
      .values({
        diaryEntryId: original.diaryEntryId,
        foodId: original.foodId,
        quantity: String(input.amount.quantity),
        quantityUnit: input.amount.quantityUnit,
        // Same rollup save-label-photo.ts uses — any field still
        // needs_review (touched or not) keeps the whole item flagged.
        confidence: anyFieldNeedsReview(input.reading) ? "needs_review" : "confident",
        correctedFromId: input.originalLoggedItemId,
      })
      .returning();

    if (!item) {
      throw new Error("Insert into logged_items returned no row.");
    }

    await tx.insert(nutrientValues).values(
      input.reading.nutrients.map((nutrient) => ({
        loggedItemId: item.id,
        code: nutrient.code,
        value: String(nutrient.value),
        unit: nutrient.unit,
        provenance: input.editedNutrientCodes.includes(nutrient.code)
          ? ("user_corrected" as const)
          : ("label_extraction" as const),
        confidence: nutrient.confidence,
      })),
    );

    return { loggedItemId: item.id };
  });

export interface CorrectLabelPhotoFoodInput {
  readonly foodId: string;
  readonly reading: ParsedLabelReading;
  // Only these nutrient codes get upserted — an untouched nutrient's
  // existing row (whatever its provenance) is left alone entirely, same
  // "don't touch what wasn't asked to change" rule writeFoodNutrients
  // follows for `database`-provenance rows.
  readonly editedNutrientCodes: readonly string[];
}

/**
 * Food-level correction (issue #51, "this product, going forward"):
 * CONTEXT.md's "editing a Food directly updates it for every future log" —
 * an in-place update, not a new row, since `foods` already is the one
 * shared record every log of this product resolves against. Each edited
 * nutrient upserts on the (food_id, code) unique index regardless of its
 * prior provenance (a `label_extraction` row becomes `user_corrected` in
 * place) — unlike `writeFoodNutrients` (src/server/food/nutrient-values.ts),
 * which is scoped to `database`-provenance rows.
 */
export const correctLabelPhotoFood = (
  db: DbClient,
  input: CorrectLabelPhotoFoodInput,
): Promise<{ readonly foodId: string }> =>
  db.transaction(async (tx) => {
    await tx
      .update(foods)
      .set({
        name: input.reading.foodName,
        brand: input.reading.brand?.value ?? null,
        servingSize:
          input.reading.servingSize?.value != null
            ? String(input.reading.servingSize.value)
            : null,
        updatedAt: sql`now()`,
      })
      .where(sql`${foods.id} = ${input.foodId}`);

    const editedNutrients = input.reading.nutrients.filter((nutrient) =>
      input.editedNutrientCodes.includes(nutrient.code),
    );

    if (editedNutrients.length > 0) {
      await tx
        .insert(nutrientValues)
        .values(
          editedNutrients.map((nutrient) => ({
            foodId: input.foodId,
            code: nutrient.code,
            value: String(nutrient.value),
            unit: nutrient.unit,
            provenance: "user_corrected" as const,
            confidence: "confident" as const,
          })),
        )
        .onConflictDoUpdate({
          target: [nutrientValues.foodId, nutrientValues.code],
          targetWhere: sql`${nutrientValues.foodId} is not null`,
          set: {
            value: sql`excluded.value`,
            unit: sql`excluded.unit`,
            provenance: sql`excluded.provenance`,
            confidence: sql`excluded.confidence`,
          },
        });
    }

    return { foodId: input.foodId };
  });
