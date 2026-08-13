import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { listCorrectionsForReview } from "../../src/eval/corrections-queue";
import { db, pool } from "../../src/server/db";
import { migrate } from "../../src/server/db/migrate";
import { diaryEntries, foods, loggedItems } from "../../src/server/db/schema";

describe("listCorrectionsForReview", () => {
  beforeAll(async () => {
    await migrate();
  });

  afterEach(async () => {
    await db.delete(loggedItems);
    await db.delete(diaryEntries);
    await db.delete(foods);
  });

  afterAll(async () => {
    await pool.end();
  });

  const seedFoodAndEntry = async () => {
    const [food] = await db
      .insert(foods)
      .values({ name: "Weetabix", provenance: "off", basisUnit: "g" })
      .returning();
    const [entry] = await db
      .insert(diaryEntries)
      .values({ entryMethod: "label_photo" })
      .returning();
    return { food, entry };
  };

  it("finds no corrections when nothing has been corrected", async () => {
    const { food, entry } = await seedFoodAndEntry();
    await db.insert(loggedItems).values({
      diaryEntryId: entry.id,
      foodId: food.id,
      quantity: "37.5",
      quantityUnit: "g",
    });

    await expect(listCorrectionsForReview()).resolves.toEqual([]);
  });

  it("surfaces a logged_item correction, paired with its original", async () => {
    const { food, entry } = await seedFoodAndEntry();
    const [original] = await db
      .insert(loggedItems)
      .values({
        diaryEntryId: entry.id,
        foodId: food.id,
        quantity: "30",
        quantityUnit: "g",
      })
      .returning();
    const [corrected] = await db
      .insert(loggedItems)
      .values({
        diaryEntryId: entry.id,
        foodId: food.id,
        quantity: "37.5",
        quantityUnit: "g",
        correctedFromId: original.id,
      })
      .returning();

    const queue = await listCorrectionsForReview();

    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      correctedItemId: corrected.id,
      originalItemId: original.id,
      foodName: "Weetabix",
      quantity: "37.5",
      quantityUnit: "g",
    });
  });
});
