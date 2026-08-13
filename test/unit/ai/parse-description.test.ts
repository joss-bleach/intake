import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { AiSdkError } from "../../../src/ai/effect-ai-sdk";
import { parseDescriptionEffect } from "../../../src/ai/parse-description";
import { ParsedDescription } from "../../../src/ai/schemas";

// A fake `attempt`, same shape/DI seam effect-ai-sdk.test.ts uses for
// generateObjectWithFallbackEffect — proves this wrapper is wired to it
// (same model as both primary and fallback, per ADR 0005) without a network
// call.
const succeedingAttempt = <A, I>(call: {
  readonly model: string;
  readonly prompt: string;
  readonly schema: Schema.Schema<A, I>;
}): Effect.Effect<A, AiSdkError> =>
  Schema.decodeUnknown(call.schema)({
    ingredients: [
      {
        name: "chicken breast",
        nameConfidence: "confident",
        quantity: 150,
        quantityUnit: "g",
        quantityConfidence: "confident",
      },
    ],
  }).pipe(
    Effect.mapError(
      (cause) => new AiSdkError({ message: "unreachable", cause, reason: "parse_failure" }),
    ),
  );

const alwaysMalformedAttempt = <A, I>(_call: {
  readonly model: string;
  readonly prompt: string;
  readonly schema: Schema.Schema<A, I>;
}): Effect.Effect<A, AiSdkError> =>
  Effect.fail(
    new AiSdkError({ message: "malformed", cause: undefined, reason: "parse_failure" }),
  );

describe("parseDescriptionEffect", () => {
  it("decodes a successful call into ParsedDescription", async () => {
    const parsed = await Effect.runPromise(
      parseDescriptionEffect("Grilled chicken breast, 150g", succeedingAttempt),
    );

    expect(parsed).toBeInstanceOf(ParsedDescription);
    expect(parsed.ingredients).toHaveLength(1);
    expect(parsed.ingredients[0].name).toBe("chicken breast");
  });

  it("fails with AiSdkError when both attempts are malformed — ADR 0001's hard-fail-closed", async () => {
    const exit = await Effect.runPromiseExit(
      parseDescriptionEffect("asdkjfh q98q3rkj not real food words", alwaysMalformedAttempt),
    );

    expect(exit._tag).toBe("Failure");
  });
});
