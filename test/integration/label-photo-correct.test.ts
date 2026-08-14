import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../../src/server/db";
import { diaryEntries, foods, loggedItems, nutrientValues, user } from "../../src/server/db/schema";
import { migrate } from "../../src/server/db/migrate";
import { saveLabelPhotoEntry } from "../../src/server/label-photo/save-label-photo";
import {
  correctLabelPhotoFood,
  correctLabelPhotoInstance,
} from "../../src/server/label-photo/correct-label-photo";
import { getDiaryEntryEffect } from "../../src/server/log-description/log-description";
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

  let userId: string;

  beforeAll(async () => {
    await migrate();
    const [row] = await db
      .insert(user)
      .values({ id: crypto.randomUUID(), name: "Test User", email: "label-correct@example.com" })
      .returning();
    userId = row.id;
  });

  afterEach(async () => {
    await db.delete(diaryEntries);
    await db.delete(foods);
  });

  afterAll(async () => {
    await db.delete(user).where(eq(user.id, userId));
    await pool.end();
  });

  it("correctLabelPhotoInstance inserts a new logged item pointing at the original, leaving it and the shared food untouched", async () => {
    const original = await saveLabelPhotoEntry(
      db,
      reading,
      { quantity: 40, quantityUnit: "g" },
      userId,
    );

    // Only sugars_g was actually edited — energy_kcal just rode along in the
    // reading unchanged.
    const corrected: ParsedLabelReading = {
      ...reading,
      nutrients: [
        { code: "energy_kcal", value: 425, unit: "kcal", confidence: "confident" },
        { code: "sugars_g", value: 18, unit: "g", confidence: "confident" },
      ],
    };

    const result = await correctLabelPhotoInstance(
      db,
      {
        originalLoggedItemId: original.loggedItemId,
        reading: corrected,
        amount: { quantity: 40, quantityUnit: "g" },
        editedNutrientCodes: ["sugars_g"],
      },
      userId,
    );

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
    const original = await saveLabelPhotoEntry(
      db,
      reading,
      { quantity: 40, quantityUnit: "g" },
      userId,
    );

    // Only the food name was edited — sugars_g (needs_review) rides along
    // untouched.
    const corrected: ParsedLabelReading = { ...reading, foodName: "Granola Bar" };

    const result = await correctLabelPhotoInstance(
      db,
      {
        originalLoggedItemId: original.loggedItemId,
        reading: corrected,
        amount: { quantity: 40, quantityUnit: "g" },
        editedNutrientCodes: [],
      },
      userId,
    );

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
    const original = await saveLabelPhotoEntry(
      db,
      reading,
      { quantity: 40, quantityUnit: "g" },
      userId,
    );

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

  it("a corrected diary entry reads back once, with the correction's own values", async () => {
    const original = await saveLabelPhotoEntry(
      db,
      reading,
      { quantity: 40, quantityUnit: "g" },
      userId,
    );

    const corrected: ParsedLabelReading = {
      ...reading,
      nutrients: [
        { code: "energy_kcal", value: 425, unit: "kcal", confidence: "confident" },
        { code: "sugars_g", value: 18, unit: "g", confidence: "confident" },
      ],
    };

    await correctLabelPhotoInstance(
      db,
      {
        originalLoggedItemId: original.loggedItemId,
        reading: corrected,
        amount: { quantity: 40, quantityUnit: "g" },
        editedNutrientCodes: ["sugars_g"],
      },
      userId,
    );

    const snapshot = await Effect.runPromise(getDiaryEntryEffect(original.diaryEntryId, userId));
    // The superseded original is still on disk for audit, but the entry is
    // one item — showing both would double-count the log.
    expect(snapshot?.items).toHaveLength(1);
    expect(snapshot?.items[0]?.id).not.toBe(original.loggedItemId);
    // ...and it reads the corrected 18g, not the shared food's untouched 22g.
    const sugars = snapshot?.items[0]?.nutrition.find((n) => n.code === "sugars_g");
    expect(sugars?.value).toBe(18);
  });

  it("an uncorrected entry still reads its nutrition off the shared food", async () => {
    const original = await saveLabelPhotoEntry(
      db,
      reading,
      { quantity: 40, quantityUnit: "g" },
      userId,
    );

    const snapshot = await Effect.runPromise(getDiaryEntryEffect(original.diaryEntryId, userId));
    expect(snapshot?.items).toHaveLength(1);
    const sugars = snapshot?.items[0]?.nutrition.find((n) => n.code === "sugars_g");
    expect(sugars?.value).toBe(22);
  });

  it("correctLabelPhotoInstance rejects an originalLoggedItemId that doesn't exist", async () => {
    await expect(
      correctLabelPhotoInstance(
        db,
        {
          originalLoggedItemId: "00000000-0000-0000-0000-000000000000",
          reading,
          amount: { quantity: 40, quantityUnit: "g" },
          editedNutrientCodes: [],
        },
        userId,
      ),
    ).rejects.toThrow("No logged item to correct.");
  });

  it("correctLabelPhotoInstance and getDiaryEntryEffect treat another user's entry as not found", async () => {
    const [otherUser] = await db
      .insert(user)
      .values({ id: crypto.randomUUID(), name: "Other User", email: "label-correct-b@example.com" })
      .returning();

    const original = await saveLabelPhotoEntry(
      db,
      reading,
      { quantity: 40, quantityUnit: "g" },
      userId,
    );

    await expect(
      correctLabelPhotoInstance(
        db,
        {
          originalLoggedItemId: original.loggedItemId,
          reading,
          amount: { quantity: 40, quantityUnit: "g" },
          editedNutrientCodes: [],
        },
        otherUser.id,
      ),
    ).rejects.toThrow("No logged item to correct.");

    const snapshot = await Effect.runPromise(
      getDiaryEntryEffect(original.diaryEntryId, otherUser.id),
    );
    expect(snapshot).toBeNull();

    await db.delete(user).where(eq(user.id, otherUser.id));
  });
});
