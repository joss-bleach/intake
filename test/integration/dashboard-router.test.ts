import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../../src/server/db";
import { diaryEntries, foods, loggedItems, nutrientValues, user } from "../../src/server/db/schema";
import { migrate } from "../../src/server/db/migrate";
import { appRouter } from "../../src/server/router";
import { saveLabelPhotoEntry } from "../../src/server/label-photo/save-label-photo";
import { correctLabelPhotoInstance } from "../../src/server/label-photo/correct-label-photo";
import type { ParsedLabelReading } from "../../src/ai/schemas";
import type { Context } from "../../src/server/context";

// No real betterauth session is exercised here (that's auth.test.ts's job)
// — just enough of a session/user shape to satisfy protectedProcedure and
// carry a real user_id, so diary entries land against a real FK.
const authedContext = async (email: string): Promise<Context> => {
  const [row] = await db
    .insert(user)
    .values({ id: crypto.randomUUID(), name: "Test User", email })
    .returning();

  const session = {
    id: crypto.randomUUID(),
    token: crypto.randomUUID(),
    userId: row.id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: null,
    userAgent: null,
  };

  return { db, session, user: row };
};

// Exercises the dashboard router end-to-end against a real Postgres (same
// pattern as goals-router.test.ts / label-photo-save.test.ts) — proves #53's
// "renders real data from both logging paths" acceptance criterion, plus
// #89's per-user scoping.
describe("dashboard router", () => {
  let ctx: Context;
  let caller: ReturnType<typeof appRouter.createCaller>;

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
    userId: string;
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
        userId: opts.userId,
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
    ctx = await authedContext("owner@example.com");
    caller = appRouter.createCaller(ctx);
  });

  afterEach(async () => {
    await db.delete(loggedItems);
    await db.delete(diaryEntries);
    await db.delete(nutrientValues);
    await db.delete(foods);
  });

  afterAll(async () => {
    await db.delete(user);
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
      userId: ctx.user!.id,
      loggedAt: atHour(now, 8),
      foodName: "Weetabix",
      provenance: "cofid",
      energyKcalPer100: 360,
      proteinGPer100: 12,
      quantity: 40,
    });
    await seedLoggedItem({
      userId: ctx.user!.id,
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
        userId: ctx.user!.id,
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
        userId: ctx.user!.id,
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

  it("reflects an instance-level correction's own nutrients, and only the newest of repeated corrections", async () => {
    const now = new Date();
    const reading: ParsedLabelReading = {
      foodName: "Granola Bar",
      foodNameConfidence: "confident",
      basisUnit: "g",
      servingSize: { value: 40, confidence: "confident" },
      nutrients: [{ code: "energy_kcal", value: 425, unit: "kcal", confidence: "confident" }],
    };
    const original = await saveLabelPhotoEntry(
      db,
      reading,
      { quantity: 40, quantityUnit: "g" },
      ctx.user!.id,
    );
    await db.update(diaryEntries).set({ loggedAt: atHour(now, 8) }).where(
      eq(diaryEntries.id, original.diaryEntryId),
    );

    // Both corrections target the same original (e.g. corrected twice from
    // the diary's historical view) — two replacement siblings, not a chain.
    await correctLabelPhotoInstance(
      db,
      {
        originalLoggedItemId: original.loggedItemId,
        reading: { ...reading, nutrients: [{ code: "energy_kcal", value: 300, unit: "kcal", confidence: "confident" }] },
        amount: { quantity: 40, quantityUnit: "g" },
        editedNutrientCodes: ["energy_kcal"],
      },
      ctx.user!.id,
    );
    await correctLabelPhotoInstance(
      db,
      {
        originalLoggedItemId: original.loggedItemId,
        reading: { ...reading, nutrients: [{ code: "energy_kcal", value: 200, unit: "kcal", confidence: "confident" }] },
        amount: { quantity: 40, quantityUnit: "g" },
        editedNutrientCodes: ["energy_kcal"],
      },
      ctx.user!.id,
    );

    const snapshot = await caller.dashboard.get();

    // The label's 425kcal/100g and the first correction's 300kcal/100g are
    // both superseded — only the second (newest) correction's 200kcal/100g
    // should count at the logged 40g, once, not both siblings summed.
    const items = snapshot.meals.flatMap((m) => m.items);
    expect(items).toHaveLength(1);
    expect(items[0]?.calories).toBe(80);
    expect(snapshot.today.calories).toBe(80);
  });

  it("rejects an unauthenticated caller", async () => {
    const anonCaller = appRouter.createCaller({ db, session: null, user: null });

    await expect(anonCaller.dashboard.get()).rejects.toMatchObject({
      constructor: TRPCError,
      code: "UNAUTHORIZED",
    });
  });

  it("keeps two accounts' dashboards fully independent", async () => {
    const otherCtx = await authedContext("other@example.com");
    const otherCaller = appRouter.createCaller(otherCtx);
    const now = new Date();

    await seedLoggedItem({
      userId: ctx.user!.id,
      loggedAt: atHour(now, 8),
      foodName: "Weetabix",
      provenance: "cofid",
      energyKcalPer100: 360,
      proteinGPer100: 12,
      quantity: 40,
    });
    await seedLoggedItem({
      userId: otherCtx.user!.id,
      loggedAt: atHour(now, 8),
      foodName: "Porridge",
      provenance: "cofid",
      energyKcalPer100: 100,
      proteinGPer100: 4,
      quantity: 40,
    });

    const snapshot = await caller.dashboard.get();
    const otherSnapshot = await otherCaller.dashboard.get();

    expect(snapshot.today.calories).toBe(144);
    expect(otherSnapshot.today.calories).toBe(40);
    const breakfast = snapshot.meals.find((m) => m.meal === "breakfast");
    const otherBreakfast = otherSnapshot.meals.find((m) => m.meal === "breakfast");
    expect(breakfast?.items).toMatchObject([{ foodName: "Weetabix" }]);
    expect(otherBreakfast?.items).toMatchObject([{ foodName: "Porridge" }]);

    await db.delete(user).where(eq(user.id, otherCtx.user!.id));
  });
});
