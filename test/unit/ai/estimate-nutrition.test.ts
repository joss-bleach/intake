import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { AiSdkError } from "../../../src/ai/effect-ai-sdk";
import { estimateNutritionEffect } from "../../../src/ai/estimate-nutrition";
import { EstimatedNutrition } from "../../../src/ai/schemas";

const succeedingAttempt = <A, I>(call: {
  readonly model: string;
  readonly prompt: string;
  readonly schema: Schema.Schema<A, I>;
}): Effect.Effect<A, AiSdkError> =>
  Schema.decodeUnknown(call.schema)({
    energyKcal: 320,
    proteinG: 22,
    carbohydrateG: 45,
    fatG: 4,
  }).pipe(
    Effect.mapError(
      (cause) => new AiSdkError({ message: "unreachable", cause, reason: "parse_failure" }),
    ),
  );

describe("estimateNutritionEffect", () => {
  it("decodes a successful call into EstimatedNutrition for the whole logged quantity", async () => {
    const estimate = await Effect.runPromise(
      estimateNutritionEffect(
        "Dragon fruit protein smoothie",
        500,
        "ml",
        succeedingAttempt,
      ),
    );

    expect(estimate).toBeInstanceOf(EstimatedNutrition);
    expect(estimate.energyKcal).toBe(320);
  });
});
