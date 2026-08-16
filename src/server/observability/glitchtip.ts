import * as Sentry from "@sentry/core";
import { Cause, Runtime } from "effect";

// Error tracking (issue #49): self-hosted GlitchTip is Sentry-SDK-compatible
// (same DSN/ingest protocol), so the Sentry SDKs talk to it directly — no
// GlitchTip-specific client needed.

// Runtime-neutral on purpose (issue #107): captures go through
// `@sentry/core`, routed to whichever client the entrypoint initialized —
// `@sentry/cloudflare` in worker.ts, `@sentry/node` via glitchtip-node.ts.

// `@sentry/node` must stay out of this file: it assumes Node's http/OTel
// machinery (silently broken on workerd) and this file ships in the Worker
// bundle via effect-trpc.ts/model-calls.ts. No client (tests) → no-op.

// Deliberately not the official `@sentry/effect` SDK (per the ticket): that
// package assumes Sentry's own tracing/span model, which this project isn't
// adopting for MVP (see docs/agents — no metrics/tracing product).
// `captureEffectFailure` below is the entire bridge.

// Effect's `runPromise`/`runSync` throw a `Runtime.FiberFailure` (an Error
// wrapping the fiber's `Cause`) when an unhandled effect fails or dies —
// this is what a top-level `catch` or an uncaught-exception handler actually
// receives, not a `Cause` object directly. Accepting either shape here means
// callers can pass whatever they caught without first checking which one it
// is.
const toCause = (cause: unknown): Cause.Cause<unknown> => {
  if (Runtime.isFiberFailure(cause)) {
    return cause[Runtime.FiberFailureCauseId];
  }
  return Cause.isCause(cause) ? cause : Cause.die(cause);
};

/**
 * Bridges an Effect failure into GlitchTip. Accepts a `Cause`, a
 * `Runtime.FiberFailure` (what `Effect.runPromise`/`runSync` throw), or a
 * bare thrown value — unwrapped to a single representative error via
 * `Cause.squash` and reported through `Sentry.captureException`.
 *
 * An interruption-only cause (fiber cancelled, not failed) is never a real
 * error and is silently skipped — reporting it would just be noise.
 */
export const captureEffectFailure = (
  cause: unknown,
  context?: { readonly tags?: Record<string, string> },
): void => {
  const effectCause = toCause(cause);
  if (Cause.isInterruptedOnly(effectCause)) return;

  const squashed = Cause.squash(effectCause);
  const error = squashed instanceof Error ? squashed : new Error(String(squashed));

  Sentry.captureException(error, {
    extra: { cause: Cause.pretty(effectCause) },
    tags: context?.tags,
  });
};
