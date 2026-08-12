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

const upsertProfileInput = z.object({
  currentWeightKg: z.number().positive().nullable(),
  targetWeightKg: z.number().positive().nullable(),
});

// Bodyweight and goals are written together by both the onboarding flow and
// the profile screen. Two separate mutations can't be made atomic from the
// client — a failed second call leaves the first one committed — so the
// combined write is one procedure over one transaction.
const upsertGoalsWithProfileInput = z.object({
  calorieGoal: z.number().int().positive(),
  macroRatio: macroRatioInput,
  profile: upsertProfileInput,
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

// The db handle or a transaction handle over it — the write helpers below run
// under both, so the standalone procedures and the combined transactional one
// can't drift on how a row is upserted.
type Tx = Parameters<Parameters<(typeof Db)["transaction"]>[0]>[0];
type DbClient = typeof Db | Tx;

const findProfile = (db: DbClient) =>
  Effect.tryPromise({
    try: () => db.query.userProfile.findFirst(),
    catch: (cause) => new DbError({ cause }),
  });

const writeProfile = (
  db: DbClient,
  input: z.infer<typeof upsertProfileInput>,
) => {
  const currentWeightKg =
    input.currentWeightKg === null ? null : String(input.currentWeightKg);
  const targetWeightKg =
    input.targetWeightKg === null ? null : String(input.targetWeightKg);

  return db
    .insert(userProfile)
    .values({ currentWeightKg, targetWeightKg })
    .onConflictDoUpdate({
      target: userProfile.id,
      set: { currentWeightKg, targetWeightKg, updatedAt: new Date() },
    })
    .returning();
};

const writeGoals = (db: DbClient, input: z.infer<typeof upsertGoalsInput>) =>
  db
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
    .returning();

// A g/kg protein override is only meaningful against a recorded bodyweight,
// so it's rejected rather than silently derived from a missing one.
const checkOverrideHasBodyweight = (
  override: z.infer<typeof proteinOverrideInput>,
  profile: ProfileRow | undefined,
) => {
  if (override?.type !== "per_kg_bodyweight") return null;

  const weight =
    override.weightSource === "target"
      ? profile?.targetWeightKg
      : profile?.currentWeightKg;

  return weight
    ? null
    : new MissingBodyweightError({ weightSource: override.weightSource });
};

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

export type ProfileSnapshot = {
  readonly currentWeightKg: number | null;
  readonly targetWeightKg: number | null;
  readonly updatedAt: string;
};

const toProfileSnapshot = (row: {
  currentWeightKg: string | null;
  targetWeightKg: string | null;
  updatedAt: Date;
}): ProfileSnapshot => ({
  currentWeightKg: row.currentWeightKg ? Number(row.currentWeightKg) : null,
  targetWeightKg: row.targetWeightKg ? Number(row.targetWeightKg) : null,
  updatedAt: row.updatedAt.toISOString(),
});

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
          const profile = yield* findProfile(ctx.db);

          const invalidOverride = checkOverrideHasBodyweight(
            input.macroRatio.proteinOverride,
            profile,
          );
          if (invalidOverride) {
            return yield* Effect.fail(invalidOverride);
          }

          const [row] = yield* Effect.tryPromise({
            try: () => writeGoals(ctx.db, input),
            catch: (cause) => new DbError({ cause }),
          });

          return toGoalsSnapshot(row, profile);
        }),
      ),
    ),

  // Single transactional write of bodyweight + goals, used by onboarding and
  // the profile screen. Sequencing two mutations from the client instead would
  // commit the profile even when the goals write fails, leaving the two rows
  // from different save attempts with no way to roll back. The override is
  // validated against the bodyweight being written in this same transaction,
  // so setting a weight and a g/kg override together succeeds on first save.
  upsertWithProfile: publicProcedure
    .input(upsertGoalsWithProfileInput)
    .mutation(({ ctx, input }) =>
      runEffect(
        Effect.tryPromise({
          try: () =>
            ctx.db.transaction(async (tx) => {
              const [profileRow] = await writeProfile(tx, input.profile);

              // Thrown, not returned: this rolls the transaction back, so a
              // rejected override leaves no bodyweight change behind either.
              const invalidOverride = checkOverrideHasBodyweight(
                input.macroRatio.proteinOverride,
                profileRow,
              );
              if (invalidOverride) {
                throw invalidOverride;
              }

              const [goalsRow] = await writeGoals(tx, input);

              return {
                goals: toGoalsSnapshot(goalsRow, profileRow),
                profile: toProfileSnapshot(profileRow),
              };
            }),
          catch: (cause) =>
            cause instanceof MissingBodyweightError
              ? cause
              : new DbError({ cause }),
        }),
      ),
    ),
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
          const [row] = yield* Effect.tryPromise({
            try: () => writeProfile(ctx.db, input),
            catch: (cause) => new DbError({ cause }),
          });

          return toProfileSnapshot(row);
        }),
      ),
    ),
});
