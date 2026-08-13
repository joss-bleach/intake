import * as Sentry from "@sentry/node";
import { Cause, Runtime } from "effect";
import { env } from "../env";

// Error tracking (issue #49): self-hosted GlitchTip is Sentry-SDK-compatible
// (same DSN/ingest protocol), so `@sentry/node` talks to it directly — no
// GlitchTip-specific client needed. Actual VPS deployment of the GlitchTip
// container is infra provisioning, out of this repo's scope (see the MVP
// spec's carve-out); this module only needs a DSN to point at once one
// exists.
//
// Deliberately not the official `@sentry/effect` SDK (per the ticket): that
// package assumes Sentry's own tracing/span model, which this project isn't
// adopting for MVP (error tracking + Effect's structured logging only, see
// docs/agents — no metrics/tracing product). `captureEffectFailure` below is
// the entire bridge.
// Lazy, idempotent, rather than a module-load side effect: every consumer
// (captureEffectFailure below, the cron tripwire's own Sentry.captureMessage)
// calls this first, so init always runs exactly once regardless of import
// order, and importing this module in a test never reaches out to Sentry's
// init machinery unless a capture actually happens.
let initialized = false;
export const initGlitchtip = (): void => {
  if (initialized) return;
  initialized = true;
  Sentry.init({
    dsn: env.GLITCHTIP_DSN,
    // No DSN (local dev, CI, or before the VPS deployment lands) — the SDK
    // no-ops every capture call rather than throwing, so callers never need
    // to guard on whether tracking is configured.
    enabled: env.GLITCHTIP_DSN !== undefined,
    tracesSampleRate: 0,
  });
};

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
  initGlitchtip();

  const effectCause = toCause(cause);
  if (Cause.isInterruptedOnly(effectCause)) return;

  const squashed = Cause.squash(effectCause);
  const error = squashed instanceof Error ? squashed : new Error(String(squashed));

  Sentry.captureException(error, {
    extra: { cause: Cause.pretty(effectCause) },
    tags: context?.tags,
  });
};
