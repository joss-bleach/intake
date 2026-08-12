import { Data, Effect } from "effect";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { runEffect } from "../effect-trpc";
import type { db as Db } from "../db";
import { userGoals, userProfile } from "../db/schema";
import {
  deriveMacroGrams,
  macroRatioPresetNames,
  proteinPerKgRange,
  type MacroGrams,
  type MacroRatio,
} from "../goals/macros";

class DbError extends Data.TaggedError("DbError")<{
  readonly cause: unknown;
}> {
  get message() {
    return "Database query failed.";
  }
}

class MissingBodyweightError extends Data.TaggedError(
  "MissingBodyweightError",
)<{
  readonly weightSource: "current" | "target";
}> {
  readonly code = "BAD_REQUEST" as const;

  get message() {
    return `Protein formula needs a ${this.weightSource} bodyweight, but none is recorded. Set it on the profile screen first.`;
  }
}

const proteinOverrideInput = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("grams"), grams: z.number().positive() }),
    z.object({
      type: z.literal("per_kg_bodyweight"),
      gramsPerKg: z
        .number()
        .min(proteinPerKgRange.min)
        .max(proteinPerKgRange.max),
      weightSource: z.enum(["current", "target"]),
    }),
  ])
  .nullable();

const macroRatioInput = z.object({
  preset: z.enum(macroRatioPresetNames),
  proteinOverride: proteinOverrideInput,
});

const upsertGoalsInput = z.object({
  calorieGoal: z.number().int().positive(),
  macroRatio: macroRatioInput,
});

export type GoalsSnapshot = {
  readonly calorieGoal: number;
  readonly macroRatio: MacroRatio;
  readonly macros: MacroGrams;
  readonly updatedAt: string;
};

type ProfileRow = {
  currentWeightKg: string | null;
  targetWeightKg: string | null;
};

const findProfile = (db: typeof Db) =>
  Effect.tryPromise({
    try: () => db.query.userProfile.findFirst(),
    catch: (cause) => new DbError({ cause }),
  });

const toBodyweight = (profile: ProfileRow | undefined) => ({
  currentWeightKg: profile?.currentWeightKg
    ? Number(profile.currentWeightKg)
    : null,
  targetWeightKg: profile?.targetWeightKg
    ? Number(profile.targetWeightKg)
    : null,
});

const toGoalsSnapshot = (
  row: { calorieGoal: number; macroRatio: unknown; updatedAt: Date },
  profile: ProfileRow | undefined,
): GoalsSnapshot => {
  const macroRatio = row.macroRatio as MacroRatio;
  const bodyweight = toBodyweight(profile);

  return {
    calorieGoal: row.calorieGoal,
    macroRatio,
    macros: deriveMacroGrams(row.calorieGoal, macroRatio, bodyweight),
    updatedAt: row.updatedAt.toISOString(),
  };
};

export const goalsRouter = router({
  // Null means "no goal set yet" — the client's onboarding-vs-dashboard
  // switch reads this directly rather than tracking a separate
  // "has onboarded" flag.
  get: publicProcedure.query(({ ctx }) =>
    runEffect(
      Effect.gen(function* () {
        const row = yield* Effect.tryPromise({
          try: () => ctx.db.query.userGoals.findFirst(),
          catch: (cause) => new DbError({ cause }),
        });
        if (!row) {
          return null;
        }

        const profile = yield* findProfile(ctx.db);
        return toGoalsSnapshot(row, profile);
      }),
    ),
  ),

  upsert: publicProcedure
    .input(upsertGoalsInput)
    .mutation(({ ctx, input }) =>
      runEffect(
        Effect.gen(function* () {
          const override = input.macroRatio.proteinOverride;
          const profile = yield* findProfile(ctx.db);

          if (override?.type === "per_kg_bodyweight") {
            const weight =
              override.weightSource === "target"
                ? profile?.targetWeightKg
                : profile?.currentWeightKg;
            if (!weight) {
              return yield* Effect.fail(
                new MissingBodyweightError({
                  weightSource: override.weightSource,
                }),
              );
            }
          }

          const [row] = yield* Effect.tryPromise({
            try: () =>
              ctx.db
                .insert(userGoals)
                .values({
                  calorieGoal: input.calorieGoal,
                  macroRatio: input.macroRatio,
                })
                .onConflictDoUpdate({
                  target: userGoals.id,
                  set: {
                    calorieGoal: input.calorieGoal,
                    macroRatio: input.macroRatio,
                    updatedAt: new Date(),
                  },
                })
                .returning(),
            catch: (cause) => new DbError({ cause }),
          });

          return toGoalsSnapshot(row, profile);
        }),
      ),
    ),
});

export type ProfileSnapshot = {
  readonly currentWeightKg: number | null;
  readonly targetWeightKg: number | null;
  readonly updatedAt: string;
};

const upsertProfileInput = z.object({
  currentWeightKg: z.number().positive().nullable(),
  targetWeightKg: z.number().positive().nullable(),
});

const toProfileSnapshot = (row: {
  currentWeightKg: string | null;
  targetWeightKg: string | null;
  updatedAt: Date;
}): ProfileSnapshot => ({
  currentWeightKg: row.currentWeightKg ? Number(row.currentWeightKg) : null,
  targetWeightKg: row.targetWeightKg ? Number(row.targetWeightKg) : null,
  updatedAt: row.updatedAt.toISOString(),
});

export const profileRouter = router({
  get: publicProcedure.query(({ ctx }) =>
    runEffect(
      Effect.gen(function* () {
        const row = yield* Effect.tryPromise({
          try: () => ctx.db.query.userProfile.findFirst(),
          catch: (cause) => new DbError({ cause }),
        });
        return row ? toProfileSnapshot(row) : null;
      }),
    ),
  ),

  // Bodyweight is explicitly skippable at onboarding (issue #45), so both
  // fields are nullable — this both records a skip and clears a
  // previously-set value from the profile screen.
  upsert: publicProcedure
    .input(upsertProfileInput)
    .mutation(({ ctx, input }) =>
      runEffect(
        Effect.gen(function* () {
          const currentWeightKg =
            input.currentWeightKg === null
              ? null
              : String(input.currentWeightKg);
          const targetWeightKg =
            input.targetWeightKg === null
              ? null
              : String(input.targetWeightKg);

          const [row] = yield* Effect.tryPromise({
            try: () =>
              ctx.db
                .insert(userProfile)
                .values({ currentWeightKg, targetWeightKg })
                .onConflictDoUpdate({
                  target: userProfile.id,
                  set: {
                    currentWeightKg,
                    targetWeightKg,
                    updatedAt: new Date(),
                  },
                })
                .returning(),
            catch: (cause) => new DbError({ cause }),
          });

          return toProfileSnapshot(row);
        }),
      ),
    ),
});
