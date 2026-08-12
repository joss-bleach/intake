import { Cause, Effect, Exit } from "effect";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// Tagged-error-ish shape (Effect's Data.TaggedError, or any plain object with
// `_tag`/`message`). Parsed rather than typeof-narrowed, per anti-slop's
// "decode unknown at the I/O boundary" rule — see tools/oxlint/anti-slop.
const taggedErrorLike = z.object({
  _tag: z.string().optional(),
  message: z.string().optional(),
});

/**
 * Runs an Effect program to completion inside a tRPC procedure, translating
 * any failure (typed Effect failure or defect) into a TRPCError so tRPC's
 * own error formatting takes over from there. This is the seam Effect
 * programs cross back into tRPC's plain-promise world — see ADR 0001 for the
 * project's wider tagged-error discipline this mirrors.
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
    throw toTRPCError(failure.value);
  }

  // A defect (unexpected throw, interruption) rather than a typed Effect
  // failure — no tag to report, so fall back to the rendered cause.
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

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message,
    cause,
  });
};
