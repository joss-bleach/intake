import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import {
  NoObjectGeneratedError,
  generateObject,
  generateText,
  streamObject,
  streamText,
} from "ai";
import { Data, Effect, Schema, Stream } from "effect";
import { env } from "../server/env";

// ADR 0004: the vendor SDK is wrapped once, here, and nothing outside this
// module imports `ai` directly. One-shot calls (generateObject/generateText)
// wrap via Effect.tryPromise; streaming calls (streamText/streamObject) wrap
// their async-iterable stream via Stream.fromAsyncIterable. Both fail with
// this single tagged error rather than a per-operation one — `reason` is
// what lets generateObjectWithFallbackEffect tell ADR 0001's "malformed
// output" retry trigger apart from every other way a call can fail (a
// missing API key, a network error, a rate limit): only "parse_failure"
// means the model actually responded with something the schema rejected.
export class AiSdkError extends Data.TaggedError("AiSdkError")<{
  readonly message: string;
  readonly cause: unknown;
  readonly reason: "parse_failure" | "call_failed";
}> {}

// One provider instance for the process. OPENROUTER_API_KEY is optional at
// the env layer (src/server/env.ts) — a call attempted without one fails at
// the AI SDK's own auth check, surfaced here as an AiSdkError like any other
// failure, rather than this module having its own opinion about the key's
// presence.
const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });

const resolveModel = (model: string): LanguageModel => openrouter(model);

// The {model, prompt} pair every call needs, regardless of whether it also
// takes a schema — shared here so the five operation wrappers below don't
// each redeclare it.
type AiCallParams = {
  readonly model: string;
  readonly prompt: string;
};

const toAiSdkError = (cause: unknown): AiSdkError =>
  new AiSdkError({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
    reason: NoObjectGeneratedError.isInstance(cause)
      ? "parse_failure"
      : "call_failed",
  });

export const generateTextEffect = (
  params: AiCallParams,
): Effect.Effect<string, AiSdkError> =>
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
export const generateObjectEffect = <A, I>(
  params: AiCallParams & { readonly schema: Schema.Schema<A, I> },
): Effect.Effect<A, AiSdkError> =>
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
// then hard-fails — a ParseFailure is never silently accepted. Only a
// `reason: "parse_failure"` triggers that retry; a `call_failed` (missing
// API key, network error, rate limit, ...) propagates immediately instead
// of burning a call against the fallback model for a failure the fallback
// can't help with. Which model is "the fallback" is deliberately not
// decided here (ADR 0005's picks are still TBD, pending the model-selection
// bake-off) — callers supply it. Valid-but-`needs_review` output never
// reaches the catch: the schema validates shape and confidence *tags*, not
// confidence *values*, so a `needs_review` field is a successful parse,
// exactly as ADR 0001 requires.
// `attempt` defaults to the real generateObjectEffect and exists as a test
// seam — it's how test/unit/ai/effect-ai-sdk.test.ts proves the "retry once
// against the fallback model, then hard-fail" order without a network call.
export const generateObjectWithFallbackEffect = <A, I>(
  params: AiCallParams & {
    readonly fallbackModel: string;
    readonly schema: Schema.Schema<A, I>;
  },
  attempt: typeof generateObjectEffect = generateObjectEffect,
): Effect.Effect<A, AiSdkError> => {
  const runAttempt = (model: string) =>
    attempt({ model, prompt: params.prompt, schema: params.schema });

  return runAttempt(params.model).pipe(
    Effect.catchAll((error) =>
      error.reason === "parse_failure"
        ? runAttempt(params.fallbackModel)
        : Effect.fail(error),
    ),
  );
};

// The AI SDK never rejects/throws mid-stream for a call-time failure (a
// missing key, a dropped connection, ...) — it reports it as a regular
// `{ type: "error", error }` element flowing through the stream like any
// other chunk (confirmed against ai's TextStreamPart/ObjectStreamPart
// union). Left alone, Stream.fromAsyncIterable would treat that as
// ordinary stream *data*, not a failure — so both streaming wrappers below
// re-lift that one part type into an Effect failure via Stream.mapEffect,
// discriminated on `part.type` the same way the AI SDK's own consumers do.
export const streamTextEffect = (params: AiCallParams) =>
  Stream.unwrap(
    Effect.sync(() =>
      streamText({ model: resolveModel(params.model), prompt: params.prompt }),
    ).pipe(
      Effect.map((result) =>
        Stream.fromAsyncIterable(result.fullStream, toAiSdkError).pipe(
          Stream.mapEffect((part) =>
            part.type === "error"
              ? Effect.fail(toAiSdkError(part.error))
              : Effect.succeed(part),
          ),
        ),
      ),
    ),
  );

export const streamObjectEffect = <A, I>(
  params: AiCallParams & { readonly schema: Schema.Schema<A, I> },
) => {
  const standardSchema = Schema.standardSchemaV1(params.schema);

  return Stream.unwrap(
    Effect.sync(() =>
      // OUTPUT is pinned to 'object' explicitly: with SCHEMA itself generic
      // (A, I unresolved at this call site), streamObject's own conditional
      // OUTPUT/RESULT inference can't collapse — TS reports the stream part
      // as an opaque conditional type rather than the real union. Pinning
      // it here is what makes `part.type === "error"` below narrow.
      streamObject<typeof standardSchema, "object">({
        model: resolveModel(params.model),
        prompt: params.prompt,
        schema: standardSchema,
      }),
    ).pipe(
      // fullStream, not partialObjectStream: the latter only ever yields
      // successive partial objects (DeepPartial<A>), with no "error" variant
      // to lift — fullStream is the one union that actually carries errors.
      Effect.map((result) =>
        Stream.fromAsyncIterable(result.fullStream, toAiSdkError).pipe(
          Stream.mapEffect((part) =>
            part.type === "error"
              ? Effect.fail(toAiSdkError(part.error))
              : Effect.succeed(part),
          ),
        ),
      ),
    ),
  );
};
