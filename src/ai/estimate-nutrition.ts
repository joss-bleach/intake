import type { Effect } from "effect";
import { env } from "../server/env";
import { type AiSdkError, generateObjectEffect, generateObjectWithFallbackEffect } from "./effect-ai-sdk";
import { EstimatedNutrition } from "./schemas";

// Total-database-gap fallback (issue #44/#46): resolveFood found nothing for
// this ingredient, so the model estimates macros directly instead of the app
// logging a silent zero. Always needs_review at the call site regardless of
// what this returns — a total gap is never "confident" by construction.
const prompt = (name: string, quantity: number, quantityUnit: string) =>
  `Estimate the total nutrition for this food item: ${quantity} ${quantityUnit} of "${name}".

Give the total amount of energy (kcal), protein (g), carbohydrate (g), and fat (g) for this exact quantity — not per 100g/100ml.`;

export const estimateNutritionEffect = (
  name: string,
  quantity: number,
  quantityUnit: string,
  attempt: typeof generateObjectEffect = generateObjectEffect,
): Effect.Effect<EstimatedNutrition, AiSdkError> =>
  generateObjectWithFallbackEffect(
    {
      model: env.DESCRIPTION_PARSE_MODEL,
      fallbackModel: env.DESCRIPTION_PARSE_MODEL,
      prompt: prompt(name, quantity, quantityUnit),
      schema: EstimatedNutrition,
    },
    attempt,
  );
