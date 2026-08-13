import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../../src/server/db";
import { diaryEntries, foods, loggedItems, nutrientValues } from "../../src/server/db/schema";
import { migrate } from "../../src/server/db/migrate";
import { appRouter } from "../../src/server/router";

// Exercises the dashboard router end-to-end against a real Postgres (same
// pattern as goals-router.test.ts / label-photo-save.test.ts) — proves #53's
// "renders real data from both logging paths" acceptance criterion at the
// procedure layer: seeded rows are shaped exactly as the description path
// (a database-resolved food) and the label-photo path (a label_extraction
// food) actually write them (see log-description.ts / save-label-photo.ts),
// not a fixture format specific to this test.
describe("dashboard router", () => {
  const caller = appRouter.createCaller({ db });

  const addUtcDays = (date: Date, days: number) => {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  };
  const atHour = (date: Date, hour: number) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour));

  // A logged item shaped like either write path leaves behind: a `foods` row
  // + its per-100(basisUnit) nutrients, a `diaryEntries` row, and one
  // `loggedItems` row quantifying how much of it was eaten.
  const seedLoggedItem = async (opts: {
    loggedAt: Date;
    foodName: string;
    provenance: "cofid" | "label_extraction";
    energyKcalPer100: number;
    proteinGPer100: number;
    quantity: number;
  }) => {
    const [food] = await db
      .insert(foods)
      .values({ name: opts.foodName, provenance: opts.provenance, basisUnit: "g" })
      .returning();
    await db.insert(nutrientValues).values([
      {
        foodId: food.id,
        code: "energy_kcal",
        value: String(opts.energyKcalPer100),
        unit: "kcal",
        provenance: opts.provenance === "cofid" ? "database" : "label_extraction",
      },
      {
        foodId: food.id,
        code: "protein_g",
        value: String(opts.proteinGPer100),
        unit: "g",
        provenance: opts.provenance === "cofid" ? "database" : "label_extraction",
      },
    ]);
    const [entry] = await db
      .insert(diaryEntries)
      .values({
        loggedAt: opts.loggedAt,
        entryMethod: opts.provenance === "cofid" ? "description" : "label_photo",
      })
      .returning();
    await db.insert(loggedItems).values({
      diaryEntryId: entry.id,
      foodId: food.id,
      quantity: String(opts.quantity),
      quantityUnit: "g",
      confidence: "confident",
    });
  };

  beforeAll(async () => {
    await migrate();
  });

  afterEach(async () => {
    await db.delete(loggedItems);
    await db.delete(diaryEntries);
    await db.delete(nutrientValues);
    await db.delete(foods);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("returns an empty-but-shaped snapshot with no logs yet", async () => {
    const snapshot = await caller.dashboard.get();

    expect(snapshot.today).toEqual({
      calories: 0,
      macros: { proteinG: 0, carbsG: 0, fatG: 0 },
    });
    expect(snapshot.meals.map((m) => m.meal)).toEqual(["breakfast", "lunch", "dinner", "snacks"]);
    expect(snapshot.meals.every((m) => m.items.length === 0)).toBe(true);
    expect(snapshot.streakDays).toBe(0);
    expect(snapshot.calorieHistory).toHaveLength(7);
    expect(snapshot.calorieHistory.every((d) => d.calories === 0)).toBe(true);
  });

  it("combines both logging paths into today's meal-grouped totals", async () => {
    const now = new Date();

    await seedLoggedItem({
      loggedAt: atHour(now, 8),
      foodName: "Weetabix",
      provenance: "cofid",
      energyKcalPer100: 360,
      proteinGPer100: 12,
      quantity: 40,
    });
    await seedLoggedItem({
      loggedAt: atHour(now, 19),
      foodName: "Granola Bar",
      provenance: "label_extraction",
      energyKcalPer100: 425,
      proteinGPer100: 8,
      quantity: 40,
    });

    const snapshot = await caller.dashboard.get();

    const breakfast = snapshot.meals.find((m) => m.meal === "breakfast");
    const dinner = snapshot.meals.find((m) => m.meal === "dinner");
    expect(breakfast?.items).toMatchObject([{ foodName: "Weetabix", calories: 144 }]);
    expect(dinner?.items).toMatchObject([{ foodName: "Granola Bar", calories: 170 }]);

    expect(snapshot.today.calories).toBe(314);
    expect(snapshot.today.macros.proteinG).toBe(8); // 4.8 + 3.2, rounded
    expect(snapshot.calorieHistory.at(-1)).toEqual({
      date: now.toISOString().slice(0, 10),
      calories: 314,
    });
    expect(snapshot.streakDays).toBe(1);
  });

  it("computes a multi-day streak and 7-day history from real rows, stopping at a gap", async () => {
    const today = new Date();

    for (const offset of [0, -1, -2, -4]) {
      await seedLoggedItem({
        loggedAt: atHour(addUtcDays(today, offset), 12),
        foodName: `Lunch day ${offset}`,
        provenance: "cofid",
        energyKcalPer100: 200,
        proteinGPer100: 10,
        quantity: 100,
      });
    }

    const snapshot = await caller.dashboard.get();

    // Logged today, yesterday, and the day before — day -3 is the gap that
    // stops the streak, so day -4 (also logged) doesn't extend it.
    expect(snapshot.streakDays).toBe(3);
    expect(snapshot.calorieHistory).toHaveLength(7);
    const byDate = new Map(snapshot.calorieHistory.map((d) => [d.date, d.calories]));
    expect(byDate.get(today.toISOString().slice(0, 10))).toBe(200);
    expect(byDate.get(addUtcDays(today, -4).toISOString().slice(0, 10))).toBe(200);
  });

  it("streak isn't capped at the 7-day chart window", async () => {
    const today = new Date();

    for (let offset = 0; offset >= -9; offset--) {
      await seedLoggedItem({
        loggedAt: atHour(addUtcDays(today, offset), 12),
        foodName: `Lunch day ${offset}`,
        provenance: "cofid",
        energyKcalPer100: 200,
        proteinGPer100: 10,
        quantity: 100,
      });
    }

    const snapshot = await caller.dashboard.get();

    // 10 consecutive logged days — calorieHistory (the chart) still only
    // shows the last 7, but the streak itself must count all 10.
    expect(snapshot.streakDays).toBe(10);
    expect(snapshot.calorieHistory).toHaveLength(7);
  });
});
