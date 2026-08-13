import { Effect, Schema } from "effect";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { runEffect } from "../effect-trpc";
import { FoodLookupRateLimiter } from "../food/rate-limiter";
import { OffLiveClient } from "../food/off-client";
import { isFoodResolutionMiss } from "../food/errors";
import { resolveFood } from "../food/resolve-food";
import { NUTRIENT_CODES, type NutrientCode } from "../food/nutrient-codes";
import { parseDescriptionEffect } from "../../ai/parse-description";
import { ClarifiedIngredient, QuantityUnit } from "../../ai/schemas";
import {
  confirmDescriptionEffect,
  correctFoodNutrientsEffect,
  correctLoggedItemEffect,
  getDiaryEntryEffect,
} from "../log-description/log-description";

const parseInput = z.object({
  description: z.string().trim().min(1),
});

const getInput = z.object({
  id: z.string().uuid(),
});

// Reuses Stage 2's own Effect Schema as the confirm mutation's input
// validator (tRPC v11 accepts any Standard Schema), same as label-photo's
// `save` — one schema owns what a valid ingredient looks like on both the
// parse and confirm sides.
const confirmInput = Schema.standardSchemaV1(
  Schema.Struct({ ingredients: Schema.NonEmptyArray(ClarifiedIngredient) }),
);

const searchFoodInput = z.object({
  query: z.string().trim().min(1),
});

const nutrientCode = z.enum(
  Object.values(NUTRIENT_CODES) as [NutrientCode, ...NutrientCode[]],
);

const correctItemInput = z.object({
  loggedItemId: z.string().uuid(),
  quantity: z.number().positive(),
  quantityUnit: z.enum(["g", "ml", "serving"]),
  resolution: z.union([
    z.object({ kind: z.literal("food"), foodId: z.string().uuid() }),
    z.object({ kind: z.literal("search"), searchTerm: z.string().trim().min(1) }),
  ]),
});

const correctFoodInput = z.object({
  foodId: z.string().uuid(),
  nutrients: z
    .array(z.object({ code: nutrientCode, value: z.number().nonnegative() }))
    .min(1),
});

// Provides the two Effect services the description path's Stage 3
// resolution needs (resolveFood's rate limiter and live-lookup client) —
// the same layers test/integration/*.test.ts provide, just wired for the
// router instead of a test. Neither is request-scoped state, so `.Default`
// per call is fine.
const withFoodLookup = <A, E>(
  effect: Effect.Effect<A, E, FoodLookupRateLimiter | OffLiveClient>,
) =>
  effect.pipe(
    Effect.provide(FoodLookupRateLimiter.Default),
    Effect.provide(OffLiveClient.Default),
  );

export const logDescriptionRouter = router({
  // Stage 1/2 only (issue #50): parses the description and returns its
  // ingredient guesses, clarifyOptions included — no database resolution,
  // no save. The client shows a clarifying chip for any ingredient that has
  // clarifyOptions, then round-trips the (possibly answered/edited)
  // ingredient array to `confirm`.
  parse: publicProcedure.input(parseInput).mutation(({ input }) =>
    runEffect(parseDescriptionEffect(input.description)),
  ),

  // Stage 3 + save over an already-parsed ingredient array (issue #50).
  // Returns the saved entry's full snapshot (not just its id) so the client
  // can render the result in one round trip.
  confirm: publicProcedure.input(confirmInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const saved = yield* withFoodLookup(confirmDescriptionEffect(input.ingredients));
        return yield* getDiaryEntryEffect(saved.id);
      }),
    ),
  ),

  get: publicProcedure.input(getInput).query(({ input }) =>
    runEffect(getDiaryEntryEffect(input.id)),
  ),

  // "Something else…" free-text search (issue #50) — used both to answer a
  // clarifying chip with a term none of the offered options cover, and to
  // swap a saved item's food during an instance-level correction. A miss
  // isn't an error here (never a dead end): the client just shows no
  // results, and correctItem/confirm's own resolution still falls through
  // to the LLM-estimate fallback if the user proceeds with the free text
  // anyway.
  searchFood: publicProcedure.input(searchFoodInput).query(({ input }) =>
    runEffect(
      withFoodLookup(
        resolveFood(input.query).pipe(
          Effect.catchIf(isFoodResolutionMiss, () => Effect.succeed([])),
          Effect.map((matches) =>
            matches.map((match) => ({
              id: match.food.id,
              name: match.food.name,
              brand: match.food.brand,
            })),
          ),
        ),
      ),
    ),
  ),

  // Instance-level correction (issue #50): additive, a new logged_items row
  // under the same diary entry with correctedFromId pointing at the
  // original — see correctLoggedItemEffect's own comment for why. Returns
  // the updated diary entry snapshot so the client can re-render in one
  // round trip.
  correctItem: publicProcedure.input(correctItemInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const { diaryEntryId } = yield* withFoodLookup(
          correctLoggedItemEffect(
            input.loggedItemId,
            input.resolution,
            input.quantity,
            input.quantityUnit as typeof QuantityUnit.Type,
          ),
        );
        return yield* getDiaryEntryEffect(diaryEntryId);
      }),
    ),
  ),

  // Food-level correction (issue #50): edits the food's nutrient_values
  // directly, so it applies to every future log of this food, not just one
  // instance. Returns the updated diary entry snapshot so an in-progress
  // view refreshes with the corrected numbers.
  correctFood: publicProcedure
    .input(correctFoodInput.and(z.object({ diaryEntryId: z.string().uuid() })))
    .mutation(({ input }) =>
      runEffect(
        Effect.gen(function* () {
          yield* correctFoodNutrientsEffect(input.foodId, input.nutrients);
          return yield* getDiaryEntryEffect(input.diaryEntryId);
        }),
      ),
    ),
});
