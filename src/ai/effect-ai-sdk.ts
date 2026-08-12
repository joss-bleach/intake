import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { generateObject, generateText, streamObject, streamText } from "ai";
import { Data, Effect, Schema, Stream } from "effect";
import { env } from "../server/env";

// ADR 0004: the vendor SDK is wrapped once, here, and nothing outside this
// module imports `ai` directly. One-shot calls (generateObject/generateText)
// wrap via Effect.tryPromise; streaming calls (streamText/streamObject) wrap
// their async-iterable stream via Stream.fromAsyncIterable. Both fail with
// this single tagged error rather than a per-operation one.
export class AiSdkError extends Data.TaggedError("AiSdkError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

// One provider instance for the process. OPENROUTER_API_KEY is optional at
// the env layer (src/server/env.ts) — a call attempted without one fails at
// the AI SDK's own auth check, surfaced here as an AiSdkError like any other
// failure, rather than this module having its own opinion about the key's
// presence.
const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });

const resolveModel = (model: string): LanguageModel => openrouter(model);

const toAiSdkError = (cause: unknown): AiSdkError =>
  new AiSdkError({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });

export const generateTextEffect = (params: {
  readonly model: string;
  readonly prompt: string;
}): Effect.Effect<string, AiSdkError> =>
  Effect.tryPromise({
    try: () =>
      generateText({
        model: resolveModel(params.model),
        prompt: params.prompt,
      }).then((result) => result.text),
    catch: toAiSdkError,
  });

// Standard Schema compatibility (ADR 0004's open assumption): an Effect
// Schema converts to a Standard Schema via Schema.standardSchemaV1, which
// generateObject's `schema` option accepts directly — no translation layer.
export const generateObjectEffect = <A, I>(params: {
  readonly model: string;
  readonly prompt: string;
  readonly schema: Schema.Schema<A, I>;
}): Effect.Effect<A, AiSdkError> =>
  Effect.tryPromise({
    try: () =>
      generateObject({
        model: resolveModel(params.model),
        prompt: params.prompt,
        schema: Schema.standardSchemaV1(params.schema),
      }).then((result) => result.object),
    catch: toAiSdkError,
  });

// ADR 0001's Stage 2 retry policy: a malformed/unparseable response (schema
// validation failing inside generateObject, which the AI SDK surfaces as a
// rejected promise) is retried once against a designated fallback model,
// then hard-fails — a ParseFailure is never silently accepted. Which model
// is "the fallback" is deliberately not decided here (ADR 0005's picks are
// still TBD, pending the model-selection bake-off) — callers supply it.
// Valid-but-`needs_review` output never reaches the catch: the schema
// validates shape and confidence *tags*, not confidence *values*, so a
// `needs_review` field is a successful parse, exactly as ADR 0001 requires.
// `attempt` defaults to the real generateObjectEffect and exists as a test
// seam — it's how test/unit/ai/effect-ai-sdk.test.ts proves the "retry once
// against the fallback model, then hard-fail" order without a network call.
export const generateObjectWithFallbackEffect = <A, I>(
  params: {
    readonly model: string;
    readonly fallbackModel: string;
    readonly prompt: string;
    readonly schema: Schema.Schema<A, I>;
  },
  attempt: typeof generateObjectEffect = generateObjectEffect,
): Effect.Effect<A, AiSdkError> =>
  attempt({
    model: params.model,
    prompt: params.prompt,
    schema: params.schema,
  }).pipe(
    Effect.catchAll(() =>
      attempt({
        model: params.fallbackModel,
        prompt: params.prompt,
        schema: params.schema,
      }),
    ),
  );

// Stream.unwrap defers calling streamText until the returned Stream is
// actually run — streamText itself doesn't return a Promise (it starts
// lazily), but calling it directly here would still fire eagerly at
// streamTextEffect()-call time rather than at Effect-run time.
export const streamTextEffect = (params: {
  readonly model: string;
  readonly prompt: string;
}) =>
  Stream.unwrap(
    Effect.sync(() =>
      streamText({ model: resolveModel(params.model), prompt: params.prompt }),
    ).pipe(
      Effect.map((result) =>
        Stream.fromAsyncIterable(result.fullStream, toAiSdkError),
      ),
    ),
  );

export const streamObjectEffect = <A, I>(params: {
  readonly model: string;
  readonly prompt: string;
  readonly schema: Schema.Schema<A, I>;
}) =>
  Stream.unwrap(
    Effect.sync(() =>
      streamObject({
        model: resolveModel(params.model),
        prompt: params.prompt,
        schema: Schema.standardSchemaV1(params.schema),
      }),
    ).pipe(
      Effect.map((result) =>
        Stream.fromAsyncIterable(result.partialObjectStream, toAiSdkError),
      ),
    ),
  );
