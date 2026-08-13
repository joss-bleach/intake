import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../../src/server/db";
import { diaryEntries, foods, loggedItems, nutrientValues } from "../../src/server/db/schema";
import { migrate } from "../../src/server/db/migrate";
import { saveLabelPhotoEntry } from "../../src/server/label-photo/save-label-photo";
import {
  correctLabelPhotoFood,
  correctLabelPhotoInstance,
} from "../../src/server/label-photo/correct-label-photo";
import type { ParsedLabelReading } from "../../src/ai/schemas";

// Exercises issue #51's two correction writes against a real Postgres, same
// pattern as label-photo-save.test.ts.
describe("correctLabelPhotoInstance / correctLabelPhotoFood", () => {
  const reading: ParsedLabelReading = {
    foodName: "Oat & Berry Granola Bar",
    foodNameConfidence: "confident",
    brand: { value: "Nature Valley", confidence: "confident" },
    basisUnit: "g",
    servingSize: { value: 40, confidence: "confident" },
    nutrients: [
      { code: "energy_kcal", value: 425, unit: "kcal", confidence: "confident" },
      { code: "sugars_g", value: 22, unit: "g", confidence: "needs_review" },
    ],
  };

  beforeAll(async () => {
    await migrate();
  });

  afterEach(async () => {
    await db.delete(diaryEntries);
    await db.delete(foods);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("correctLabelPhotoInstance inserts a new logged item pointing at the original, leaving it and the shared food untouched", async () => {
    const original = await saveLabelPhotoEntry(db, reading, { quantity: 40, quantityUnit: "g" });

    // Only sugars_g was actually edited — energy_kcal just rode along in the
    // reading unchanged.
    const corrected: ParsedLabelReading = {
      ...reading,
      nutrients: [
        { code: "energy_kcal", value: 425, unit: "kcal", confidence: "confident" },
        { code: "sugars_g", value: 18, unit: "g", confidence: "confident" },
      ],
    };

    const result = await correctLabelPhotoInstance(db, {
      originalLoggedItemId: original.loggedItemId,
      diaryEntryId: original.diaryEntryId,
      foodId: original.foodId,
      reading: corrected,
      amount: { quantity: 40, quantityUnit: "g" },
      editedNutrientCodes: ["sugars_g"],
    });

    expect(result.loggedItemId).not.toBe(original.loggedItemId);

    const [correctedItem] = await db
      .select()
      .from(loggedItems)
      .where(eq(loggedItems.id, result.loggedItemId));
    expect(correctedItem).toMatchObject({
      diaryEntryId: original.diaryEntryId,
      foodId: original.foodId,
      correctedFromId: original.loggedItemId,
      confidence: "confident",
    });

    // The correction's own nutrient facts, scoped to the new logged item —
    // a complete record, but only the edited nutrient is reattributed to
    // the user; the untouched one keeps its original provenance.
    const correctedNutrients = await db
      .select()
      .from(nutrientValues)
      .where(eq(nutrientValues.loggedItemId, result.loggedItemId));
    expect(correctedNutrients).toHaveLength(2);
    const sugars = correctedNutrients.find((n) => n.code === "sugars_g");
    expect(sugars).toMatchObject({ provenance: "user_corrected", confidence: "confident" });
    expect(Number(sugars?.value)).toBe(18);
    const energy = correctedNutrients.find((n) => n.code === "energy_kcal");
    expect(energy).toMatchObject({ provenance: "label_extraction", confidence: "confident" });

    // The original logged item and the shared food's nutrients are kept for
    // audit (ADR 0001), unmodified.
    const [originalItem] = await db
      .select()
      .from(loggedItems)
      .where(eq(loggedItems.id, original.loggedItemId));
    expect(originalItem?.correctedFromId).toBeNull();

    const foodNutrients = await db
      .select()
      .from(nutrientValues)
      .where(eq(nutrientValues.foodId, original.foodId));
    const originalSugars = foodNutrients.find((n) => n.code === "sugars_g");
    expect(Number(originalSugars?.value)).toBe(22);
    expect(originalSugars?.provenance).toBe("label_extraction");
  });

  it("an untouched needs_review nutrient keeps its confidence, never silently becomes confident", async () => {
    const original = await saveLabelPhotoEntry(db, reading, { quantity: 40, quantityUnit: "g" });

    // Only the food name was edited — sugars_g (needs_review) rides along
    // untouched.
    const corrected: ParsedLabelReading = { ...reading, foodName: "Granola Bar" };

    const result = await correctLabelPhotoInstance(db, {
      originalLoggedItemId: original.loggedItemId,
      diaryEntryId: original.diaryEntryId,
      foodId: original.foodId,
      reading: corrected,
      amount: { quantity: 40, quantityUnit: "g" },
      editedNutrientCodes: [],
    });

    const [item] = await db.select().from(loggedItems).where(eq(loggedItems.id, result.loggedItemId));
    // Nothing was actually verified — the correction as a whole still needs
    // review, same rollup rule as the original save.
    expect(item?.confidence).toBe("needs_review");

    const nutrients = await db
      .select()
      .from(nutrientValues)
      .where(eq(nutrientValues.loggedItemId, result.loggedItemId));
    const sugars = nutrients.find((n) => n.code === "sugars_g");
    expect(sugars).toMatchObject({ provenance: "label_extraction", confidence: "needs_review" });
  });

  it("correctLabelPhotoFood updates the shared food row in place, touching only the edited nutrient", async () => {
    const original = await saveLabelPhotoEntry(db, reading, { quantity: 40, quantityUnit: "g" });

    const corrected: ParsedLabelReading = {
      ...reading,
      foodName: "Oat & Berry Bar",
      nutrients: [
        { code: "energy_kcal", value: 425, unit: "kcal", confidence: "confident" },
        { code: "sugars_g", value: 18, unit: "g", confidence: "confident" },
      ],
    };

    const result = await correctLabelPhotoFood(db, {
      foodId: original.foodId,
      reading: corrected,
      editedNutrientCodes: ["sugars_g"],
    });
    expect(result.foodId).toBe(original.foodId);

    const [food] = await db.select().from(foods).where(eq(foods.id, original.foodId));
    expect(food?.name).toBe("Oat & Berry Bar");

    const nutrients = await db
      .select()
      .from(nutrientValues)
      .where(eq(nutrientValues.foodId, original.foodId));
    expect(nutrients).toHaveLength(2);
    const sugars = nutrients.find((n) => n.code === "sugars_g");
    expect(sugars).toMatchObject({ provenance: "user_corrected", confidence: "confident" });
    expect(Number(sugars?.value)).toBe(18);
    // energy_kcal wasn't in editedNutrientCodes — left exactly as extracted.
    const energy = nutrients.find((n) => n.code === "energy_kcal");
    expect(energy).toMatchObject({ provenance: "label_extraction", confidence: "confident" });

    // No new logged item, no correction lineage — this is an in-place edit
    // of the product, not an instance-level correction.
    const items = await db.select().from(loggedItems).where(eq(loggedItems.foodId, original.foodId));
    expect(items).toHaveLength(1);
    expect(items[0]?.correctedFromId).toBeNull();
  });
});
