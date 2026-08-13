import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../../src/server/db";
import {
  diaryEntries,
  foods,
  loggedItems,
  nutrientValues,
} from "../../src/server/db/schema";
import { migrate } from "../../src/server/db/migrate";
import { saveLabelPhotoEntry } from "../../src/server/label-photo/save-label-photo";
import type { ParsedLabelReading } from "../../src/ai/schemas";

// Exercises the label-photo save path against a real Postgres (same pattern
// as test/integration/goals-router.test.ts) — this is issue #47's
// end-to-end acceptance criterion ("photographing a clear, complete label
// results in a saved DiaryEntry"), proved at the write-path layer since
// extraction itself depends on a real vision-model call (see
// test/integration/ai-sdk.test.ts's real-round-trip pattern for why that
// part is skipped without OPENROUTER_API_KEY).
describe("saveLabelPhotoEntry", () => {
  const reading: ParsedLabelReading = {
    foodName: "Oat & Berry Granola Bar",
    foodNameConfidence: "confident",
    brand: { value: "Nature Valley", confidence: "confident" },
    basisUnit: "g",
    servingSize: { value: 40, confidence: "confident" },
    nutrients: [
      { code: "energy_kcal", value: 425, unit: "kcal", confidence: "confident" },
      { code: "protein_g", value: 8, unit: "g", confidence: "confident" },
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

  it("writes a food, its nutrients, a diary entry and a logged item, skipping food-database resolution", async () => {
    const result = await saveLabelPhotoEntry(db, reading, {
      quantity: 40,
      quantityUnit: "g",
    });

    const [food] = await db.select().from(foods).where(eq(foods.id, result.foodId));
    expect(food).toMatchObject({
      name: "Oat & Berry Granola Bar",
      brand: "Nature Valley",
      provenance: "label_extraction",
      basisUnit: "g",
    });
    expect(Number(food?.servingSize)).toBe(40);

    const nutrients = await db
      .select()
      .from(nutrientValues)
      .where(eq(nutrientValues.foodId, result.foodId));
    expect(nutrients).toHaveLength(3);
    expect(nutrients.every((n) => n.provenance === "label_extraction")).toBe(true);
    const sugars = nutrients.find((n) => n.code === "sugars_g");
    expect(sugars?.confidence).toBe("needs_review");
    const protein = nutrients.find((n) => n.code === "protein_g");
    expect(protein?.confidence).toBe("confident");

    const [entry] = await db
      .select()
      .from(diaryEntries)
      .where(eq(diaryEntries.id, result.diaryEntryId));
    expect(entry?.entryMethod).toBe("label_photo");

    const [item] = await db
      .select()
      .from(loggedItems)
      .where(eq(loggedItems.diaryEntryId, result.diaryEntryId));
    expect(item).toMatchObject({
      foodId: result.foodId,
      quantityUnit: "g",
      // A needs_review nutrient rolls the whole logged item up to
      // needs_review too — it never blocks the save (ADR 0001), it's just
      // visible.
      confidence: "needs_review",
    });
    expect(Number(item?.quantity)).toBe(40);
  });

  it("logged item stays confident when every extracted field was", async () => {
    const allConfident: ParsedLabelReading = {
      ...reading,
      nutrients: [
        { code: "energy_kcal", value: 425, unit: "kcal", confidence: "confident" },
        { code: "protein_g", value: 8, unit: "g", confidence: "confident" },
        { code: "sugars_g", value: 22, unit: "g", confidence: "confident" },
      ],
    };

    const result = await saveLabelPhotoEntry(db, allConfident, {
      quantity: 1,
      quantityUnit: "serving",
    });

    const [item] = await db
      .select()
      .from(loggedItems)
      .where(eq(loggedItems.diaryEntryId, result.diaryEntryId));
    expect(item?.confidence).toBe("confident");
  });
});
