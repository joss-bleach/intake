import { Cause, Effect, Exit } from "effect";
import { TRPCError } from "@trpc/server";

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

const toTRPCError = (error: unknown): TRPCError => {
  if (error instanceof TRPCError) {
    return error;
  }

  const tag =
    typeof error === "object" && error !== null && "_tag" in error
      ? String((error as { _tag: unknown })._tag)
      : "UnknownError";
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : `Effect failed with tagged error: ${tag}`;

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message,
    cause: error,
  });
};
