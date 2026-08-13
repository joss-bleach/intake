import { Cause, Effect, Exit } from "effect";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { TRPC_ERROR_CODE_KEY } from "@trpc/server/rpc";
import { captureEffectFailure } from "./observability/glitchtip";

// Error tracking must never change what the client sees: a broken reporter
// would otherwise replace the real TRPCError with its own throw.
const report = (cause: Cause.Cause<unknown>): void => {
  try {
    captureEffectFailure(cause, { tags: { source: "trpc" } });
  } catch {
    // Nothing useful left to do — the original error still gets thrown below.
  }
};

// Tagged-error-ish shape (Effect's Data.TaggedError, or any plain object with
// `_tag`/`message`). Parsed rather than typeof-narrowed, per anti-slop's
// "decode unknown at the I/O boundary" rule — see tools/oxlint/anti-slop.
// `code` is an opt-in escape hatch: a tagged error can name its own TRPCError
// code (e.g. "BAD_REQUEST" for a user-input problem) instead of every
// failure defaulting to INTERNAL_SERVER_ERROR.
const trpcErrorCode = z.enum([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "PAYLOAD_TOO_LARGE",
  "UNPROCESSABLE_CONTENT",
  "TOO_MANY_REQUESTS",
  "CLIENT_CLOSED_REQUEST",
  "INTERNAL_SERVER_ERROR",
]) satisfies z.ZodType<TRPC_ERROR_CODE_KEY>;

const taggedErrorLike = z.object({
  _tag: z.string().optional(),
  message: z.string().optional(),
  code: trpcErrorCode.optional(),
});

/**
 * Runs an Effect program to completion inside a tRPC procedure, translating
 * any failure (typed Effect failure or defect) into a TRPCError so tRPC's
 * own error formatting takes over from there. This is the seam Effect
 * programs cross back into tRPC's plain-promise world — see ADR 0001 for the
 * project's wider tagged-error discipline this mirrors.
 *
 * It is also where server-side request failures reach GlitchTip (issue #49):
 * every defect, plus any typed failure that becomes a 500.
 */
export const runEffect = async <A, E>(
  effect: Effect.Effect<A, E>,
): Promise<A> => {
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  const failure = Cause.failureOption(exit.cause);
  if (failure._tag === "Some") {
    const trpcError = toTRPCError(failure.value);
    // Expected failures carry their own 4xx-ish code and are part of normal
    // request handling (not found, bad input) — only the ones that reach the
    // client as a server error are worth an error-tracking event.
    if (trpcError.code === "INTERNAL_SERVER_ERROR") {
      report(exit.cause);
    }
    throw trpcError;
  }

  // A defect (unexpected throw, interruption) rather than a typed Effect
  // failure — no tag to report, so fall back to the rendered cause.
  report(exit.cause);
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: Cause.pretty(exit.cause),
    cause: exit.cause,
  });
};

const toTRPCError = (cause: unknown): TRPCError => {
  if (cause instanceof TRPCError) {
    return cause;
  }

  const parsed = taggedErrorLike.safeParse(cause);
  const tag = (parsed.success && parsed.data._tag) || "UnknownError";
  const message =
    (parsed.success && parsed.data.message) ||
    `Effect failed with tagged error: ${tag}`;
  const code =
    (parsed.success && parsed.data.code) || "INTERNAL_SERVER_ERROR";

  return new TRPCError({ code, message, cause });
};
