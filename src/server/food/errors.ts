import { Data } from "effect";

// The two ways resolveFood's live cache-miss path can fail to produce a
// food, per issue #44's acceptance criteria: distinct tagged errors
// internally (so callers/tests can tell "we didn't even try" from "we tried
// and there's really nothing"), but both meant to trigger the same
// LLM-estimate fallback externally — see isFoodResolutionMiss below.

/** The live-OFF-lookup rate limit denied this attempt before it ran. */
export class RateLimitExceededError extends Data.TaggedError(
  "RateLimitExceededError",
)<{
  readonly retryAfterMs: number;
}> {}

/** Local cache and (if attempted) the live lookup both came up empty. */
export class FoodNotFoundError extends Data.TaggedError("FoodNotFoundError")<{
  readonly query: string;
}> {}

export type FoodResolutionError = RateLimitExceededError | FoodNotFoundError;

/**
 * True for either failure mode resolveFood can produce. Callers on the
 * description-parsing path (issue #46) use this as the single trigger for
 * falling back to an LLM-estimated food — the distinction between "denied"
 * and "genuinely missing" only matters for internal logging/metrics, not for
 * deciding what happens next.
 */
export const isFoodResolutionMiss = (
  cause: unknown,
): cause is FoodResolutionError =>
  cause instanceof RateLimitExceededError || cause instanceof FoodNotFoundError;
