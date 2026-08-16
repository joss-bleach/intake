import { sql } from "drizzle-orm";
import { Data, Effect } from "effect";
import { db } from "./db";
import { env } from "./env";

/**
 * The per-user ceiling was reached — surfaced to the client as a 429, not
 * swallowed. Unlike the food-lookup limiter's RateLimitExceededError (which
 * means "fall back to an LLM estimate"), there is no cheaper path to fall
 * back to here: the model call *is* the request.
 */
export class ModelCallRateLimitExceededError extends Data.TaggedError(
  "ModelCallRateLimitExceededError",
)<{ readonly retryAfterMs: number }> {
  readonly code = "TOO_MANY_REQUESTS" as const;
  get message() {
    return "That's a lot of requests in a short time — give it a minute and try again.";
  }
}

const currentWindowStart = (nowMs: number, windowMs: number): Date =>
  new Date(Math.floor(nowMs / windowMs) * windowMs);

/**
 * Caps how many paid model calls one account can trigger in a fixed window.
 *
 * Every AI entrypoint (label OCR, description parsing) spends real money on
 * our OpenRouter key per request, and a session cookie is all it takes to
 * call one in a loop. Authentication bounds *who* can spend; this bounds
 * *how much*.
 *
 * Same insert-or-increment upsert as the food-lookup limiter, for the same
 * reason: the row lock serializes concurrent callers, so two requests can't
 * both read a stale count and both squeak under the limit. Keyed per subject
 * so one account hitting its ceiling never denies anyone else, and held in
 * Postgres rather than memory because a Worker isolate is not a stable place
 * to keep a counter.
 */
export const consumeModelCallBudget = (
  subject: string,
): Effect.Effect<void, ModelCallRateLimitExceededError> =>
  Effect.gen(function* () {
    const windowMs = env.MODEL_CALL_RATE_LIMIT_WINDOW_SECONDS * 1_000;
    const now = Date.now();
    const windowStart = currentWindowStart(now, windowMs);
    const retryAfterMs = windowStart.getTime() + windowMs - now;

    // A failed upsert is an infra defect (DB down), not a rate-limit
    // decision — die rather than folding it into the typed failure, which
    // callers translate straight into a 429.
    const result = yield* Effect.tryPromise(() =>
      db.execute<{ count: number }>(sql`
        insert into model_call_rate_limit_windows (subject, window_start, count)
        values (${subject}, ${windowStart.toISOString()}, 1)
        on conflict (subject, window_start)
        do update set count = model_call_rate_limit_windows.count + 1
        returning count
      `),
    ).pipe(Effect.orDie);

    const count = result.rows[0]?.count ?? 0;
    if (count > env.MODEL_CALL_RATE_LIMIT_MAX) {
      yield* Effect.fail(new ModelCallRateLimitExceededError({ retryAfterMs }));
    }
  });
