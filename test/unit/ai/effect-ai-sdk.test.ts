import { Cause, Effect, Exit, Schema, Stream } from "effect";
import { describe, expect, it } from "vitest";
import {
  AiSdkError,
  generateObjectEffect,
  generateObjectWithFallbackEffect,
  generateTextEffect,
  streamObjectEffect,
  streamTextEffect,
  toGenerateObjectSchema,
  toSdkPrompt,
} from "../../../src/ai/effect-ai-sdk";
import { ParsedLabelReading } from "../../../src/ai/schemas";

const failureValue = (exit: Exit.Exit<unknown, unknown>): unknown => {
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Cause.failureOption(exit.cause);
  return failure._tag === "Some" ? failure.value : undefined;
};

// These exercise the wrapper against the real OpenRouter provider (no
// network mocking) but never reach the network: with no
// OPENROUTER_API_KEY set — true for local/CI, see .env.example — the AI SDK
// rejects during its own auth check before a request goes out (confirmed
// against @openrouter/ai-sdk-provider's LoadAPIKeyError), so these stay
// fast and offline while still proving the tagged-error wrapping is real.
// toSdkPrompt has no network dependency, unlike the effects above — it just
// builds the shape the AI SDK's `prompt` param accepts, so it's asserted
// directly rather than through a real call.
describe("toSdkPrompt", () => {
  it("passes a plain string through untouched when there are no images", () => {
    expect(toSdkPrompt({ model: "m", prompt: "describe this" })).toBe(
      "describe this",
    );
  });

  it("builds a single multimodal user message when images are present", () => {
    const result = toSdkPrompt({
      model: "m",
      prompt: "read this label",
      images: [{ data: "base64data", mediaType: "image/jpeg" }],
    });

    expect(result).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "read this label" },
          { type: "image", image: "base64data", mediaType: "image/jpeg" },
        ],
      },
    ]);
  });

  it("folds multiple images into the same user message, in order", () => {
    const result = toSdkPrompt({
      model: "m",
      prompt: "read these labels",
      images: [
        { data: "front", mediaType: "image/jpeg" },
        { data: "back", mediaType: "image/jpeg" },
      ],
    });

    expect(Array.isArray(result) && result[0].content).toEqual([
      { type: "text", text: "read these labels" },
      { type: "image", image: "front", mediaType: "image/jpeg" },
      { type: "image", image: "back", mediaType: "image/jpeg" },
    ]);
  });
});

// TrivialSchema (below) is a required string — it can't exercise an
// optional field, a cross-field refinement, or a constrained array, all of
// which production calls rely on. ParsedLabelReading has all three.
describe("toGenerateObjectSchema", () => {
  // toGenerateObjectSchema's `validate` never returns a promise — Effect's
  // decode is synchronous — but the AI SDK's type covers both. Narrow it
  // here so assertions below can read `.success` without a type error.
  const runValidate = <V extends object>(
    converted: { validate?: (value: V) => unknown },
    value: V,
  ) => converted.validate?.(value) as { success: boolean; value?: unknown; error?: unknown } | undefined;

  const validReading = {
    foodName: "Baked Beans",
    foodNameConfidence: "confident" as const,
    basisUnit: "g" as const,
    nutrients: [
      { code: "energy_kcal", value: 84, unit: "kcal", confidence: "confident" as const },
      { code: "protein_g", value: 5.1, unit: "g", confidence: "confident" as const },
    ],
  };

  it("round-trips a valid production payload, optional fields omitted", () => {
    const converted = toGenerateObjectSchema(ParsedLabelReading);

    const result = runValidate(converted, validReading);
    expect(result).toEqual({
      success: true,
      value: Schema.decodeUnknownSync(ParsedLabelReading)(validReading),
    });
  });

  it("round-trips a valid payload with its optional field present", () => {
    const converted = toGenerateObjectSchema(ParsedLabelReading);
    const withBrand = { ...validReading, brand: { value: "Heinz", confidence: "confident" as const } };

    const result = runValidate(converted, withBrand);
    expect(result).toEqual({
      success: true,
      value: Schema.decodeUnknownSync(ParsedLabelReading)(withBrand),
    });
  });

  it("rejects a payload that fails the schema's cross-field refinement", () => {
    const converted = toGenerateObjectSchema(ParsedLabelReading);
    const wrongUnit = {
      ...validReading,
      nutrients: [{ code: "energy_kcal", value: 84, unit: "g", confidence: "confident" as const }],
    };

    const result = runValidate(converted, wrongUnit);
    expect(result?.success).toBe(false);
  });

  it("rejects a payload that violates the array's minItems constraint", () => {
    const converted = toGenerateObjectSchema(ParsedLabelReading);
    const emptyNutrients = { ...validReading, nutrients: [] };

    const result = runValidate(converted, emptyNutrients);
    expect(result?.success).toBe(false);
  });
});

describe("generateTextEffect / generateObjectEffect", () => {
  it("fails with a single tagged AiSdkError, not a raw rejection", async () => {
    const exit = await Effect.runPromiseExit(
      generateTextEffect({ model: "test/model", prompt: "hi" }),
    );

    expect(failureValue(exit)).toBeInstanceOf(AiSdkError);
  });

  it("generateObjectEffect also fails as AiSdkError, carrying the schema through the call", async () => {
    const TrivialSchema = Schema.Struct({ greeting: Schema.String });

    const exit = await Effect.runPromiseExit(
      generateObjectEffect({
        model: "test/model",
        prompt: "say hi",
        schema: TrivialSchema,
      }),
    );

    expect(failureValue(exit)).toBeInstanceOf(AiSdkError);
  });
});

describe("streamTextEffect / streamObjectEffect", () => {
  it("streamTextEffect doesn't call the AI SDK until the stream is actually run", async () => {
    // Constructing the stream must not throw or start the call — Stream.unwrap
    // defers streamText() until something runs the returned Stream.
    const stream = streamTextEffect({ model: "test/model", prompt: "hi" });

    const exit = await Effect.runPromiseExit(Stream.runCollect(stream));

    expect(Exit.isFailure(exit)).toBe(true);
    expect(failureValue(exit)).toBeInstanceOf(AiSdkError);
  });

  it("streamObjectEffect fails the same way, with the schema wired through", async () => {
    const TrivialSchema = Schema.Struct({ greeting: Schema.String });
    const stream = streamObjectEffect({
      model: "test/model",
      prompt: "say hi",
      schema: TrivialSchema,
    });

    const exit = await Effect.runPromiseExit(Stream.runCollect(stream));

    expect(failureValue(exit)).toBeInstanceOf(AiSdkError);
  });
});

describe("generateObjectWithFallbackEffect", () => {
  const TrivialSchema = Schema.Struct({ greeting: Schema.String });
  const params = {
    model: "primary/model",
    fallbackModel: "fallback/model",
    prompt: "say hi",
    schema: TrivialSchema,
  };

  // A fake `attempt`, generic like the real generateObjectEffect it
  // replaces (the DI seam effect-ai-sdk.ts documents), so this proves the
  // retry *order* without a network call: succeeds only once called with
  // the fallback model. `failReason` defaults to "parse_failure" — the only
  // reason ADR 0001 says should trigger the fallback retry at all.
  const makeAttempt = (
    succeedsFor: string,
    attempts: string[],
    failReason: AiSdkError["reason"] = "parse_failure",
  ) =>
    <A, I>(call: {
      readonly model: string;
      readonly prompt: string;
      readonly schema: Schema.Schema<A, I>;
    }): Effect.Effect<A, AiSdkError> => {
      attempts.push(call.model);
      if (call.model !== succeedsFor) {
        return Effect.fail(
          new AiSdkError({
            message: "malformed",
            cause: undefined,
            reason: failReason,
          }),
        );
      }
      return Schema.decodeUnknown(call.schema)({ greeting: "hi" }).pipe(
        Effect.mapError(
          (cause) =>
            new AiSdkError({
              message: "test fake decode failed",
              cause,
              reason: "call_failed",
            }),
        ),
      );
    };

  it("retries once against the fallback model when the primary fails, then succeeds", async () => {
    const attempts: string[] = [];

    const result = await Effect.runPromise(
      generateObjectWithFallbackEffect(
        params,
        makeAttempt(params.fallbackModel, attempts),
      ),
    );

    expect(attempts).toEqual([params.model, params.fallbackModel]);
    expect(result).toEqual({ greeting: "hi" });
  });

  it("hard-fails once the fallback also fails — never retries a third time", async () => {
    const attempts: string[] = [];

    const exit = await Effect.runPromiseExit(
      generateObjectWithFallbackEffect(params, makeAttempt("nothing", attempts)),
    );

    expect(attempts).toEqual([params.model, params.fallbackModel]);
    expect(failureValue(exit)).toBeInstanceOf(AiSdkError);
  });

  it("skips the fallback entirely when the primary succeeds", async () => {
    const attempts: string[] = [];

    const result = await Effect.runPromise(
      generateObjectWithFallbackEffect(params, makeAttempt(params.model, attempts)),
    );

    expect(attempts).toEqual([params.model]);
    expect(result).toEqual({ greeting: "hi" });
  });

  it("never retries a call_failed error (e.g. auth/network) against the fallback", async () => {
    const attempts: string[] = [];

    const exit = await Effect.runPromiseExit(
      generateObjectWithFallbackEffect(
        params,
        makeAttempt("nothing", attempts, "call_failed"),
      ),
    );

    // Only the primary was ever tried — a call_failed reason means the
    // fallback model can't help, so it's never worth the extra call.
    expect(attempts).toEqual([params.model]);
    expect(failureValue(exit)).toBeInstanceOf(AiSdkError);
  });
});
