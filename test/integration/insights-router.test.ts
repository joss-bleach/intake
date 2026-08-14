import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../../src/server/db";
import { diaryEntries, foods, loggedItems, nutrientValues } from "../../src/server/db/schema";
import { migrate } from "../../src/server/db/migrate";
import { appRouter } from "../../src/server/router";

// Exercises the insights router end-to-end against a real Postgres (same
// pattern as dashboard-router.test.ts) — proves #55's %NRV computation,
// zero-log-day-exclusion averaging, and more-of/less-of/on-target grouping
// at the procedure layer.
describe("insights router", () => {
  const caller = appRouter.createCaller({ db, session: null, user: null });

  const addUtcDays = (date: Date, days: number) => {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  };
  const atHour = (date: Date, hour: number) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour));

  // Seeds a food carrying every curated NRV nutrient at a fixed per-100g
  // value, logged at 100g quantity — so consumed == the per-100g value,
  // keeping the test math simple.
  const seedNrvFood = async (opts: {
    loggedAt: Date;
    proteinGPer100: number;
    fatGPer100: number;
  }) => {
    const [food] = await db
      .insert(foods)
      .values({ name: "Test food", provenance: "cofid", basisUnit: "g" })
      .returning();
    await db.insert(nutrientValues).values([
      { foodId: food.id, code: "protein_g", value: String(opts.proteinGPer100), unit: "g", provenance: "database" },
      { foodId: food.id, code: "fat_g", value: String(opts.fatGPer100), unit: "g", provenance: "database" },
    ]);
    const [entry] = await db
      .insert(diaryEntries)
      .values({ loggedAt: opts.loggedAt, entryMethod: "description" })
      .returning();
    await db.insert(loggedItems).values({
      diaryEntryId: entry.id,
      foodId: food.id,
      quantity: "100",
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
    const snapshot = await caller.insights.get();

    expect(snapshot.today.macroSplit).toEqual({ proteinG: 0, carbsG: 0, fatG: 0 });
    // Curated NRV set has 7 nutrients; with nothing logged every one reads
    // 0% and falls in "more".
    expect(snapshot.today.nrvItems).toHaveLength(7);
    expect(snapshot.today.nrvItems.every((item) => item.pct === 0 && item.direction === "more")).toBe(true);
    expect(snapshot.week).toEqual(snapshot.today);
  });

  it("computes %NRV against the curated reference for today's log", async () => {
    const now = new Date();
    // Protein NRV is 50g, so 50g consumed reads exactly 100% (on target).
    // Fat NRV is 70g, so 35g consumed reads 50% (get more of).
    await seedNrvFood({ loggedAt: atHour(now, 12), proteinGPer100: 50, fatGPer100: 35 });

    const snapshot = await caller.insights.get();

    const protein = snapshot.today.nrvItems.find((item) => item.code === "protein_g");
    const fat = snapshot.today.nrvItems.find((item) => item.code === "fat_g");
    expect(protein).toMatchObject({ pct: 100, direction: "on-target" });
    expect(fat).toMatchObject({ pct: 50, direction: "more" });
    expect(snapshot.today.macroSplit.proteinG).toBe(50);
  });

  it("excludes zero-log days from the weekly average", async () => {
    const today = new Date();

    // Logged on only 2 of the 7 rolling-window days, 50g protein each time.
    await seedNrvFood({ loggedAt: atHour(today, 12), proteinGPer100: 50, fatGPer100: 0 });
    await seedNrvFood({ loggedAt: atHour(addUtcDays(today, -3), 12), proteinGPer100: 50, fatGPer100: 0 });

    const snapshot = await caller.insights.get();

    // Average is 100g / 2 logged days = 50g, not 100g / 7.
    expect(snapshot.week.macroSplit.proteinG).toBe(50);
    const weekProtein = snapshot.week.nrvItems.find((item) => item.code === "protein_g");
    expect(weekProtein).toMatchObject({ pct: 100, direction: "on-target" });
  });

  it("groups and sorts items furthest-from-target first within each direction", async () => {
    const now = new Date();
    // Protein NRV 50g: 5g consumed -> 10% ("more", distance 90).
    // Fat NRV 70g: 140g consumed -> 200% ("less", distance 100).
    await seedNrvFood({ loggedAt: atHour(now, 12), proteinGPer100: 5, fatGPer100: 140 });

    const snapshot = await caller.insights.get();

    const byDirection = (direction: string) =>
      snapshot.today.nrvItems
        .filter((item) => item.direction === direction)
        .sort((a, b) => b.distanceFromTarget - a.distanceFromTarget);

    expect(byDirection("less").map((item) => item.code)).toEqual(["fat_g"]);
    const moreDistances = byDirection("more").map((item) => item.distanceFromTarget);
    expect(moreDistances).toEqual([...moreDistances].sort((a, b) => b - a));
    expect(byDirection("more").map((item) => item.code)).toContain("protein_g");
  });
});
