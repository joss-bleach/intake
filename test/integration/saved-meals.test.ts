import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../../src/server/db";
import { migrate } from "../../src/server/db/migrate";
import {
  diaryEntries,
  foods,
  loggedItems,
  savedMealItems,
  savedMeals,
} from "../../src/server/db/schema";
import { appRouter } from "../../src/server/router";

// Exercises search/recently-logged/saved-meals end-to-end through the real
// tRPC router against a real Postgres (issue #52) — same pattern as
// test/integration/goals-router.test.ts.
describe("saved meals & recently-logged", () => {
  const caller = appRouter.createCaller({ db });

  beforeAll(async () => {
    await migrate();
  });

  afterEach(async () => {
    await db.delete(savedMealItems);
    await db.delete(savedMeals);
    await db.delete(loggedItems);
    await db.delete(diaryEntries);
    await db.delete(foods);
  });

  afterAll(async () => {
    await pool.end();
  });

  const seedFood = async (name: string) => {
    const [food] = await db
      .insert(foods)
      .values({ name, provenance: "off", basisUnit: "g" })
      .returning();
    return food;
  };

  const logFood = async (foodId: string, loggedAt?: Date) => {
    const values = loggedAt
      ? { entryMethod: "description" as const, loggedAt }
      : { entryMethod: "description" as const };
    const [entry] = await db.insert(diaryEntries).values(values).returning();
    await db.insert(loggedItems).values({
      diaryEntryId: entry.id,
      foodId,
      quantity: "100",
      quantityUnit: "g",
    });
    return entry;
  };

  describe("search", () => {
    it("groups a repeatedly-logged food into one recently-logged suggestion", async () => {
      const food = await seedFood("Weetabix");
      await logFood(food.id);
      await logFood(food.id);
      await logFood(food.id);

      const results = await caller.savedMeals.search({});

      expect(results).toEqual([
        expect.objectContaining({
          type: "recently_logged",
          foodId: food.id,
          name: "Weetabix",
          timesLogged: 3,
        }),
      ]);
    });

    it("ranks more-frequently-logged foods first", async () => {
      const oats = await seedFood("Porridge Oats");
      const banana = await seedFood("Banana");
      await logFood(oats.id);
      await logFood(banana.id);
      await logFood(banana.id);

      const results = await caller.savedMeals.search({});

      expect(results.map((r) => r.name)).toEqual(["Banana", "Porridge Oats"]);
    });

    it("breaks equal-frequency ties by most-recently logged", async () => {
      const stale = await seedFood("Stale Bread");
      const fresh = await seedFood("Fresh Bread");
      await logFood(stale.id, new Date("2026-01-01T08:00:00Z"));
      await logFood(fresh.id, new Date("2026-06-01T08:00:00Z"));

      const results = await caller.savedMeals.search({});

      expect(results.map((r) => r.timesLogged)).toEqual([1, 1]);
      expect(results.map((r) => r.name)).toEqual(["Fresh Bread", "Stale Bread"]);
    });

    it("filters by query text", async () => {
      await logFood((await seedFood("Weetabix")).id);
      await logFood((await seedFood("Banana")).id);

      const results = await caller.savedMeals.search({ query: "wee" });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ name: "Weetabix" });
    });

    it("includes saved meals alongside recently-logged foods, ranked together", async () => {
      // An unrelated food, logged once — the low end of the ranking.
      const oats = await seedFood("Porridge Oats");
      await logFood(oats.id);

      // A saved meal, re-logged 3 times. Re-logging writes real logged_items
      // rows too, so its own food (Protein Powder) also becomes a
      // recently-logged suggestion with a matching count — both entries
      // should outrank the once-logged food.
      const proteinPowder = await seedFood("Protein Powder");
      const meal = await caller.savedMeals.create({
        name: "Post-workout shake",
        items: [{ foodId: proteinPowder.id, quantity: 30, quantityUnit: "g" }],
      });
      await caller.savedMeals.relog({ savedMealId: meal.id });
      await caller.savedMeals.relog({ savedMealId: meal.id });
      await caller.savedMeals.relog({ savedMealId: meal.id });

      const results = await caller.savedMeals.search({});

      expect(results).toHaveLength(3);
      expect(results.map((r) => r.timesLogged)).toEqual([3, 3, 1]);
      expect(results[2]).toMatchObject({ name: "Porridge Oats" });
      expect(
        results.some(
          (r) => r.type === "saved_meal" && r.savedMealId === meal.id,
        ),
      ).toBe(true);
    });
  });

  describe("create", () => {
    it("creates a named multi-item saved meal", async () => {
      const rice = await seedFood("Rice");
      const beans = await seedFood("Beans");

      const meal = await caller.savedMeals.create({
        name: "Rice and beans",
        items: [
          { foodId: rice.id, quantity: 150, quantityUnit: "g" },
          { foodId: beans.id, quantity: 100, quantityUnit: "g" },
        ],
      });

      expect(meal).toMatchObject({
        name: "Rice and beans",
        timesLogged: 0,
        lastLoggedAt: null,
      });
      expect(meal.items).toHaveLength(2);
    });
  });

  describe("relog", () => {
    it("re-logs a saved meal's items in one action and tracks usage", async () => {
      const rice = await seedFood("Rice");
      const beans = await seedFood("Beans");
      const meal = await caller.savedMeals.create({
        name: "Rice and beans",
        items: [
          { foodId: rice.id, quantity: 150, quantityUnit: "g" },
          { foodId: beans.id, quantity: 100, quantityUnit: "g" },
        ],
      });

      const entry = await caller.savedMeals.relog({ savedMealId: meal.id });

      expect(entry.entryMethod).toBe("saved_meal");
      expect(entry.items).toHaveLength(2);
      expect(entry.items.map((i) => i.foodName).sort()).toEqual([
        "Beans",
        "Rice",
      ]);

      const [refetched] = await caller.savedMeals.search({ query: "rice" });
      expect(refetched).toMatchObject({ timesLogged: 1 });
    });

    it("rejects re-logging a saved meal that doesn't exist", async () => {
      await expect(
        caller.savedMeals.relog({ savedMealId: crypto.randomUUID() }),
      ).rejects.toThrow();
    });
  });
});
