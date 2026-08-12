import { Cause, Effect, Exit, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  AiSdkError,
  generateObjectEffect,
  generateObjectWithFallbackEffect,
  generateTextEffect,
} from "../../../src/ai/effect-ai-sdk";

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
  // the fallback model.
  const makeAttempt = (succeedsFor: string, attempts: string[]) =>
    <A, I>(call: {
      readonly model: string;
      readonly prompt: string;
      readonly schema: Schema.Schema<A, I>;
    }): Effect.Effect<A, AiSdkError> => {
      attempts.push(call.model);
      if (call.model !== succeedsFor) {
        return Effect.fail(new AiSdkError({ message: "malformed", cause: undefined }));
      }
      return Schema.decodeUnknown(call.schema)({ greeting: "hi" }).pipe(
        Effect.mapError(
          (cause) => new AiSdkError({ message: "test fake decode failed", cause }),
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
});
