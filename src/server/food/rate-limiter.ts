import { sql } from "drizzle-orm";
import { Effect } from "effect";
import { db } from "../db";
import { env } from "../env";
import { RateLimitExceededError } from "./errors";

// Fixed-window counter, one row per window, keyed by the window's own start
// time. `checkAndConsume` does an atomic insert-or-increment (Postgres
// upsert), so concurrent callers can't both read a stale count and both
// squeak under the limit — the row lock the upsert takes serializes them.
// Deliberately a plain table rather than Effect's built-in `RateLimiter`:
// issue #44 asks for this to be restart-durable and shared across server
// instances, which an in-memory limiter can't give.
const currentWindowStart = (nowMs: number, windowMs: number): Date =>
  new Date(Math.floor(nowMs / windowMs) * windowMs);

export class FoodLookupRateLimiter extends Effect.Service<FoodLookupRateLimiter>()(
  "FoodLookupRateLimiter",
  {
    effect: Effect.sync(() => {
      const windowMs = env.FOOD_LOOKUP_RATE_LIMIT_WINDOW_SECONDS * 1_000;
      const maxPerWindow = env.FOOD_LOOKUP_RATE_LIMIT_MAX;

      const checkAndConsume: Effect.Effect<void, RateLimitExceededError> =
        Effect.gen(function* () {
          const now = Date.now();
          const windowStart = currentWindowStart(now, windowMs);
          const retryAfterMs = windowStart.getTime() + windowMs - now;

          // A failed insert/update here is an infra defect (DB down, bad
          // connection), not a rate-limit decision — let it die rather than
          // folding it into RateLimitExceededError, which callers treat as
          // "try the LLM-estimate fallback instead".
          const result = yield* Effect.tryPromise(() =>
            db.execute<{ count: number }>(sql`
              insert into food_lookup_rate_limit_windows (window_start, count)
              values (${windowStart.toISOString()}, 1)
              on conflict (window_start)
              do update set count = food_lookup_rate_limit_windows.count + 1
              returning count
            `),
          ).pipe(Effect.orDie);

          const count = result.rows[0]?.count ?? 0;
          if (count > maxPerWindow) {
            return yield* Effect.fail(
              new RateLimitExceededError({ retryAfterMs }),
            );
          }
        });

      return { checkAndConsume } as const;
    }),
  },
) {}
