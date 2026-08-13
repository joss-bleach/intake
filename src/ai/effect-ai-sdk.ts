import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel, ModelMessage } from "ai";
import {
  NoObjectGeneratedError,
  generateObject,
  generateText,
  jsonSchema,
  streamObject,
  streamText,
} from "ai";
import { Data, Effect, JSONSchema, ParseResult, Schema, Stream } from "effect";
import type { ModelCallOutcome } from "../server/observability/model-calls";
import { recordModelCall } from "../server/observability/model-calls";
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
// `reason`'s type is model-calls.ts's `ModelCallOutcome` minus "success" —
// a call that fails can't record a success outcome, and deriving it keeps
// the two vocabularies (this and model_calls.outcome) from drifting apart.
export class AiSdkError extends Data.TaggedError("AiSdkError")<{
  readonly message: string;
  readonly cause: unknown;
  readonly reason: Exclude<ModelCallOutcome, "success">;
}> {}

// One provider instance for the process. OPENROUTER_API_KEY is optional at
// the env layer (src/server/env.ts) — a call attempted without one fails at
// the AI SDK's own auth check, surfaced here as an AiSdkError like any other
// failure, rather than this module having its own opinion about the key's
// presence.
const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });

const resolveModel = (model: string): LanguageModel => openrouter(model);

// Issue #49: identifies one logical call for model_calls tracking.
// Client-generated `correlationId` so a fallback retry's two rows can still
// be tied together. Deliberately optional on TrackedAiCallParams below, not
// a required argument: the (future) eval harness's own runs (issue #48,
// already logged its own way) simply omit it, which is what keeps them out
// of model_calls — "production calls only" per the ticket's acceptance
// criteria, with no separate eval/production flag to keep in sync.
type Tracking = {
  readonly pipelineStage: string;
  readonly correlationId: string;
};

// The {model, prompt} pair every call needs, regardless of whether it also
// takes a schema — shared here so the five operation wrappers below don't
// each redeclare it. `images` is optional and additive: the label-photo
// pipeline (issue #47, base64 nutrition-panel photos) is the only caller
// that supplies it — text-only callers (description parsing) never set it
// and see no behavior change.
type AiCallParams = {
  readonly model: string;
  readonly prompt: string;
  readonly images?: ReadonlyArray<{
    readonly data: string;
    readonly mediaType: string;
  }>;
};

// `tracking` only exists on the two one-shot wrappers (generateTextEffect,
// generateObjectEffect) — those are the only ones withTracking actually
// instruments. It's deliberately not on plain AiCallParams: streamTextEffect
// and streamObjectEffect would otherwise accept it and silently do nothing
// with it, which is worse than a caller not being able to ask for it at all.
type TrackedAiCallParams = AiCallParams & { readonly tracking?: Tracking };

const toAiSdkError = (cause: unknown): AiSdkError =>
  new AiSdkError({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
    reason: NoObjectGeneratedError.isInstance(cause)
      ? "parse_failure"
      : "call_failed",
  });

// generateObject/generateText both accept `prompt: string | ModelMessage[]`
// — a plain string for text-only calls, or a single user message mixing
// text and image parts for multimodal ones. Kept as one helper so both
// wrappers build the vision-capable shape identically. Exported as a test
// seam (no network involved in building the shape) — test/unit/ai asserts
// it directly rather than through a real generateObject call.
export const toSdkPrompt = (params: AiCallParams): string | ModelMessage[] =>
  params.images && params.images.length > 0
    ? [
        {
          role: "user",
          content: [
            { type: "text", text: params.prompt },
            ...params.images.map(
              (image) =>
                ({
                  type: "image",
                  image: image.data,
                  mediaType: image.mediaType,
                }) as const,
            ),
          ],
        },
      ]
    : params.prompt;

// Shape generateText/generateObject results share, and all `recordModelCall`
// actually reads off a successful result — narrow enough that both one-shot
// wrappers below satisfy it without this module caring which one it is.
type UsageBearingResult = {
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
  };
  readonly providerMetadata?: {
    readonly openrouter?: { readonly usage?: { readonly cost?: number } };
  };
};

// Times a call and, only when the caller opted in via `tracking`, writes
// its outcome to model_calls (src/server/observability/model-calls.ts) —
// "success" with whatever usage/cost the provider returned, or the same
// `reason` the call already failed with. Recording never changes what the
// caller sees (`recordModelCall`'s error channel is `never`) and a missing
// `tracking` skips it entirely rather than writing a placeholder row. It
// does sequence before returning — recordModelCall's own short timeout is
// what keeps that from turning into an unbounded stall.
const withTracking = <T extends UsageBearingResult>(
  tracking: Tracking | undefined,
  model: string,
  call: Effect.Effect<T, AiSdkError>,
): Effect.Effect<T, AiSdkError> => {
  if (!tracking) return call;

  const startedAt = Date.now();
  return call.pipe(
    Effect.tap((result) =>
      recordModelCall({
        ...tracking,
        model,
        outcome: "success",
        latencyMs: Date.now() - startedAt,
        promptTokens: result.usage?.inputTokens,
        completionTokens: result.usage?.outputTokens,
        costUsd: result.providerMetadata?.openrouter?.usage?.cost,
      }),
    ),
    Effect.tapError((error) =>
      recordModelCall({
        ...tracking,
        model,
        outcome: error.reason,
        latencyMs: Date.now() - startedAt,
      }),
    ),
  );
};

export const generateTextEffect = (
  params: TrackedAiCallParams,
): Effect.Effect<string, AiSdkError> =>
  withTracking(
    params.tracking,
    params.model,
    Effect.tryPromise({
      try: () =>
        generateText({
          model: resolveModel(params.model),
          prompt: toSdkPrompt(params),
        }),
      catch: toAiSdkError,
    }),
    // .text is read inside the same Effect.try/catch discipline as the call
    // itself — a throw here (however unlikely off a resolved data property)
    // still becomes a typed AiSdkError, not a defect that skips
    // generateObjectWithFallbackEffect's catchAll below.
  ).pipe(Effect.flatMap((result) => Effect.try({ try: () => result.text, catch: toAiSdkError })));

// ADR 0004's Schema.standardSchemaV1 assumption doesn't hold: the AI SDK's
// adapter needs a `~standard.jsonSchema` converter Effect's output doesn't
// supply (confirmed against real OpenRouter calls, issue #54). Built via
// `jsonSchema()` instead; exported so tests can round-trip it directly.
export const toGenerateObjectSchema = <A, I>(schema: Schema.Schema<A, I>) =>
  jsonSchema<A>(JSONSchema.make(schema), {
    validate: (value) => {
      const result = Schema.decodeUnknownEither(schema)(value);
      return result._tag === "Right"
        ? { success: true, value: result.right }
        : { success: false, error: new Error(ParseResult.TreeFormatter.formatErrorSync(result.left)) };
    },
  });

export const generateObjectEffect = <A, I>(
  params: TrackedAiCallParams & { readonly schema: Schema.Schema<A, I> },
): Effect.Effect<A, AiSdkError> =>
  withTracking(
    params.tracking,
    params.model,
    Effect.tryPromise({
      try: () =>
        generateObject({
          model: resolveModel(params.model),
          prompt: toSdkPrompt(params),
          schema: toGenerateObjectSchema(params.schema),
        }),
      catch: toAiSdkError,
    }),
  ).pipe(Effect.flatMap((result) => Effect.try({ try: () => result.object, catch: toAiSdkError })));

// ADR 0001's Stage 2 retry policy: a malformed/unparseable response (schema
// validation failing inside generateObject, which the AI SDK surfaces as a
// rejected promise) is retried once against a designated fallback model,
// then hard-fails — a ParseFailure is never silently accepted. Only a
// `reason: "parse_failure"` triggers that retry; a `call_failed` (missing
// API key, network error, rate limit, ...) propagates immediately instead
// of burning a call against the fallback model for a failure the fallback
// can't help with. Which model is "the fallback" is deliberately not
// decided here — callers supply it (ADR 0005's picks live in env.ts).
// Valid-but-`needs_review` output never
// reaches the catch: the schema validates shape and confidence *tags*, not
// confidence *values*, so a `needs_review` field is a successful parse,
// exactly as ADR 0001 requires.
// `attempt` defaults to the real generateObjectEffect and exists as a test
// seam — it's how test/unit/ai/effect-ai-sdk.test.ts proves the "retry once
// against the fallback model, then hard-fail" order without a network call.
export const generateObjectWithFallbackEffect = <A, I>(
  params: TrackedAiCallParams & {
    readonly fallbackModel: string;
    readonly schema: Schema.Schema<A, I>;
  },
  attempt: typeof generateObjectEffect = generateObjectEffect,
): Effect.Effect<A, AiSdkError> => {
  const runAttempt = (model: string) =>
    attempt({
      model,
      prompt: params.prompt,
      images: params.images,
      schema: params.schema,
      tracking: params.tracking,
    });

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
      streamText({
        model: resolveModel(params.model),
        prompt: toSdkPrompt(params),
      }),
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
  const aiSdkSchema = toGenerateObjectSchema(params.schema);

  return Stream.unwrap(
    Effect.sync(() =>
      // OUTPUT is pinned to 'object' explicitly: with SCHEMA itself generic
      // (A, I unresolved at this call site), streamObject's own conditional
      // OUTPUT/RESULT inference can't collapse — TS reports the stream part
      // as an opaque conditional type rather than the real union. Pinning
      // it here is what makes `part.type === "error"` below narrow.
      streamObject<typeof aiSdkSchema, "object">({
        model: resolveModel(params.model),
        prompt: toSdkPrompt(params),
        schema: aiSdkSchema,
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
