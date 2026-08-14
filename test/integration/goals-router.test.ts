import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../../src/server/db";
import { user, userGoals, userProfile } from "../../src/server/db/schema";
import { migrate } from "../../src/server/db/migrate";
import { appRouter } from "../../src/server/router";
import type { Context } from "../../src/server/context";

// No real betterauth session is exercised here (that's auth.test.ts's job)
// — just enough of a session/user shape to satisfy protectedProcedure and
// carry a real user_id, so goals/profile writes land against a real FK.
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

// Exercises goals/profile through the real tRPC router against a real
// Postgres — proves onboarding (#45) and per-user scoping (#88).
describe("goals & profile routers", () => {
  let ctx: Context;
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    await migrate();
    ctx = await authedContext("owner@example.com");
    caller = appRouter.createCaller(ctx);
  });

  afterEach(async () => {
    await db.delete(userGoals);
    await db.delete(userProfile);
  });

  afterAll(async () => {
    await db.delete(user);
    await pool.end();
  });

  it("rejects an unauthenticated caller", async () => {
    const anonCaller = appRouter.createCaller({
      db,
      session: null,
      user: null,
    });

    await expect(anonCaller.goals.get()).rejects.toMatchObject({
      constructor: TRPCError,
      code: "UNAUTHORIZED",
    });
    await expect(
      anonCaller.goals.upsert({
        calorieGoal: 2000,
        macroRatio: { preset: "balanced", proteinOverride: null },
      }),
    ).rejects.toMatchObject({ constructor: TRPCError, code: "UNAUTHORIZED" });
    await expect(anonCaller.profile.get()).rejects.toMatchObject({
      constructor: TRPCError,
      code: "UNAUTHORIZED",
    });
  });

  it("keeps two accounts' goals and profile fully independent", async () => {
    const otherCtx = await authedContext("other@example.com");
    const otherCaller = appRouter.createCaller(otherCtx);

    await caller.goals.upsert({
      calorieGoal: 2000,
      macroRatio: { preset: "balanced", proteinOverride: null },
    });
    await caller.profile.upsert({ currentWeightKg: 80, targetWeightKg: 70 });

    // The second account has set nothing yet — it must not see the first
    // account's goal/profile, not even partially.
    await expect(otherCaller.goals.get()).resolves.toBeNull();
    await expect(otherCaller.profile.get()).resolves.toBeNull();

    await otherCaller.goals.upsert({
      calorieGoal: 3000,
      macroRatio: { preset: "high_protein", proteinOverride: null },
    });
    await otherCaller.profile.upsert({
      currentWeightKg: 60,
      targetWeightKg: 55,
    });

    await expect(caller.goals.get()).resolves.toMatchObject({
      calorieGoal: 2000,
    });
    await expect(otherCaller.goals.get()).resolves.toMatchObject({
      calorieGoal: 3000,
    });
    await expect(caller.profile.get()).resolves.toMatchObject({
      currentWeightKg: 80,
    });
    await expect(otherCaller.profile.get()).resolves.toMatchObject({
      currentWeightKg: 60,
    });

    await db.delete(user).where(eq(user.id, otherCtx.user!.id));
  });

  it("reports no goal set until onboarding writes one", async () => {
    await expect(caller.goals.get()).resolves.toBeNull();
  });

  it("upserts a calorie goal and derives macros from the preset", async () => {
    const snapshot = await caller.goals.upsert({
      calorieGoal: 2000,
      macroRatio: { preset: "balanced", proteinOverride: null },
    });

    expect(snapshot.calorieGoal).toBe(2000);
    expect(snapshot.macros).toEqual({
      proteinGrams: 150,
      carbsGrams: 200,
      fatGrams: 67,
    });

    await expect(caller.goals.get()).resolves.toMatchObject({
      calorieGoal: 2000,
    });
  });

  it("editing the goal later overwrites the same per-user row", async () => {
    await caller.goals.upsert({
      calorieGoal: 2000,
      macroRatio: { preset: "balanced", proteinOverride: null },
    });
    const updated = await caller.goals.upsert({
      calorieGoal: 2400,
      macroRatio: { preset: "high_protein", proteinOverride: null },
    });

    expect(updated.calorieGoal).toBe(2400);
    const { rows } = await pool.query(
      "SELECT count(*) FROM user_goals WHERE user_id = $1",
      [ctx.user!.id],
    );
    expect(rows[0].count).toBe("1");
  });

  it("captures bodyweight into user_profile, separate from user_goals", async () => {
    const snapshot = await caller.profile.upsert({
      currentWeightKg: 82.5,
      targetWeightKg: 75,
    });

    expect(snapshot).toMatchObject({
      currentWeightKg: 82.5,
      targetWeightKg: 75,
    });
    await expect(caller.goals.get()).resolves.toBeNull();
  });

  it("skips bodyweight capture by accepting nulls", async () => {
    await expect(
      caller.profile.upsert({ currentWeightKg: null, targetWeightKg: null }),
    ).resolves.toMatchObject({ currentWeightKg: null, targetWeightKg: null });
  });

  it("derives protein from bodyweight via the g/kg formula once weight is set", async () => {
    await caller.profile.upsert({ currentWeightKg: 80, targetWeightKg: 70 });

    const snapshot = await caller.goals.upsert({
      calorieGoal: 2200,
      macroRatio: {
        preset: "high_protein",
        proteinOverride: {
          type: "per_kg_bodyweight",
          gramsPerKg: 2,
          weightSource: "current",
        },
      },
    });

    expect(snapshot.macros.proteinGrams).toBe(160);
  });

  it("rejects the g/kg formula when the chosen weight source isn't recorded", async () => {
    await expect(
      caller.goals.upsert({
        calorieGoal: 2200,
        macroRatio: {
          preset: "high_protein",
          proteinOverride: {
            type: "per_kg_bodyweight",
            gramsPerKg: 2,
            weightSource: "target",
          },
        },
      }),
    ).rejects.toMatchObject({
      constructor: TRPCError,
      code: "BAD_REQUEST",
    });
  });

  it("saves bodyweight and goals together in one call", async () => {
    const result = await caller.goals.upsertWithProfile({
      calorieGoal: 2200,
      macroRatio: {
        preset: "high_protein",
        proteinOverride: {
          type: "per_kg_bodyweight",
          gramsPerKg: 2,
          weightSource: "current",
        },
      },
      profile: { currentWeightKg: 80, targetWeightKg: 70 },
    });

    // The override resolves against the bodyweight written by this same
    // call — onboarding sets both for the first time in one go.
    expect(result.goals.macros.proteinGrams).toBe(160);
    expect(result.profile).toMatchObject({
      currentWeightKg: 80,
      targetWeightKg: 70,
    });
    await expect(caller.goals.get()).resolves.toMatchObject({
      calorieGoal: 2200,
    });
    await expect(caller.profile.get()).resolves.toMatchObject({
      currentWeightKg: 80,
    });
  });

  it("rolls the bodyweight write back when the goals write is rejected", async () => {
    await caller.profile.upsert({ currentWeightKg: 80, targetWeightKg: 70 });

    await expect(
      caller.goals.upsertWithProfile({
        calorieGoal: 2200,
        macroRatio: {
          preset: "high_protein",
          proteinOverride: {
            type: "per_kg_bodyweight",
            gramsPerKg: 2,
            weightSource: "target",
          },
        },
        // Clearing the target weight invalidates the override above, so the
        // whole transaction must fail rather than commit the clear.
        profile: { currentWeightKg: 90, targetWeightKg: null },
      }),
    ).rejects.toMatchObject({ constructor: TRPCError, code: "BAD_REQUEST" });

    await expect(caller.profile.get()).resolves.toMatchObject({
      currentWeightKg: 80,
      targetWeightKg: 70,
    });
    await expect(caller.goals.get()).resolves.toBeNull();
  });

  it("overrides protein with a direct gram value", async () => {
    const snapshot = await caller.goals.upsert({
      calorieGoal: 2000,
      macroRatio: {
        preset: "balanced",
        proteinOverride: { type: "grams", grams: 180 },
      },
    });

    expect(snapshot.macros.proteinGrams).toBe(180);
  });
});
