import { Effect } from "effect";
import { estimateNutritionEffect } from "../../ai/estimate-nutrition";
import { type AiSdkError, type generateObjectEffect } from "../../ai/effect-ai-sdk";
import type { ParsedIngredient } from "../../ai/schemas";
import { db } from "../db";
import { foods, nutrientValues } from "../db/schema";
import { NUTRIENT_CODES, NUTRIENT_UNITS, type NutrientCode, type NutrientUnit } from "../food/nutrient-codes";
import { isFoodResolutionMiss } from "../food/errors";
import { resolveFood } from "../food/resolve-food";
import type { FoodLookupRateLimiter } from "../food/rate-limiter";
import type { OffLiveClient } from "../food/off-client";

export interface ResolvedLoggedItem {
  readonly foodId: string;
  readonly quantity: number;
  readonly quantityUnit: "g" | "ml" | "serving";
  readonly confidence: "confident" | "needs_review";
}

// A field the model itself flagged as a guess makes the whole logged item
// needs_review — matches ADR 0001's field-level provenance rolling up to a
// single review nudge per item, same as the prototype's needsReview check.
const isConfident = (ingredient: ParsedIngredient) =>
  ingredient.nameConfidence === "confident" &&
  ingredient.quantityConfidence === "confident";

type FallbackNutrientRow = {
  readonly code: NutrientCode;
  readonly value: number;
  readonly unit: NutrientUnit;
};

// Writes a one-off `foods` row for a total-database-gap ingredient (issue
// #44's LLM-estimate fallback), normalized like every OFF/CoFID row to
// per-100-basisUnit (schema.ts). Inserts nutrient_values directly, not via
// writeFoodNutrients — its `database`-provenance contract would mislabel this.

// Scales the AI's *whole logged quantity* estimate down to per-100-basisUnit.
// A "serving" quantity isn't itself in basisUnit terms, so this food also
// gets a synthetic servingSize (100 basisUnit) to convert back through on
// read (nutrient-scaling.ts) — g/ml quantities need no such conversion.
const createFallbackFood = (
  ingredient: ParsedIngredient,
  estimateAttempt: typeof generateObjectEffect,
): Effect.Effect<{ readonly foodId: string }, AiSdkError> =>
  Effect.gen(function* () {
    const estimate = yield* estimateNutritionEffect(
      ingredient.name,
      ingredient.quantity,
      ingredient.quantityUnit,
      estimateAttempt,
    );
    const isServing = ingredient.quantityUnit === "serving";
    const basisUnit = ingredient.quantityUnit === "ml" ? "ml" : "g";
    const servingSize = isServing ? 100 : null;
    // Non-serving: quantity is already basisUnit-denominated, scale by
    // 100/quantity. Serving: quantity*servingSize(100) is the basisUnit
    // amount, so scale by 1/quantity to hit the same per-100 target.
    const scale = (isServing ? 1 : 100) / ingredient.quantity;

    const nutrients: FallbackNutrientRow[] = [
      { code: NUTRIENT_CODES.energyKcal, value: estimate.energyKcal * scale, unit: NUTRIENT_UNITS[NUTRIENT_CODES.energyKcal] },
      { code: NUTRIENT_CODES.protein, value: estimate.proteinG * scale, unit: NUTRIENT_UNITS[NUTRIENT_CODES.protein] },
      { code: NUTRIENT_CODES.carbohydrate, value: estimate.carbohydrateG * scale, unit: NUTRIENT_UNITS[NUTRIENT_CODES.carbohydrate] },
      { code: NUTRIENT_CODES.fat, value: estimate.fatG * scale, unit: NUTRIENT_UNITS[NUTRIENT_CODES.fat] },
    ];

    const foodId = yield* Effect.tryPromise(() =>
      db.transaction(async (tx) => {
        const [food] = await tx
          .insert(foods)
          .values({
            name: ingredient.name,
            provenance: "llm_estimate_fallback",
            basisUnit,
            servingSize: servingSize === null ? null : String(servingSize),
          })
          .returning();
        await tx.insert(nutrientValues).values(
          nutrients.map((nutrient) => ({
            foodId: food.id,
            code: nutrient.code,
            value: String(nutrient.value),
            unit: nutrient.unit,
            provenance: "llm_estimate_fallback" as const,
          })),
        );
        return food.id;
      }),
    ).pipe(Effect.orDie);
    return { foodId };
  });

/**
 * Stage 3 of the description path (ADR 0001, issue #46): resolve one Stage 2
 * ParsedIngredient into a food the diary entry can actually reference. A
 * database match (OFF/CoFID/a prior live lookup) wins when resolveFood finds
 * one — ambiguity between several matches is issue #50's concern, so the
 * happy path just takes the first; a genuine miss falls through to the
 * LLM-estimate fallback instead of failing the whole entry, per #44.
 */
export const resolveIngredientEffect = (
  ingredient: ParsedIngredient,
  estimateAttempt: typeof generateObjectEffect,
): Effect.Effect<ResolvedLoggedItem, AiSdkError, FoodLookupRateLimiter | OffLiveClient> =>
  Effect.gen(function* () {
    const matches = yield* resolveFood(ingredient.name).pipe(
      Effect.catchIf(isFoodResolutionMiss, () => Effect.succeed([])),
    );

    if (matches.length > 0) {
      return {
        foodId: matches[0].food.id,
        quantity: ingredient.quantity,
        quantityUnit: ingredient.quantityUnit,
        confidence: isConfident(ingredient) ? "confident" : ("needs_review" as const),
      };
    }

    const { foodId } = yield* createFallbackFood(ingredient, estimateAttempt);
    return {
      foodId,
      quantity: ingredient.quantity,
      quantityUnit: ingredient.quantityUnit,
      confidence: "needs_review" as const,
    };
  });
