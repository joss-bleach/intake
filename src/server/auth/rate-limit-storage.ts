import { eq, lt, sql } from "drizzle-orm";
import type { BetterAuthOptions } from "better-auth";
import { db } from "../db";
import { rateLimit } from "../db/auth-schema";

type RateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]
>;

// Betterauth's own database storage prunes as it goes; taking over `consume`
// takes that with it, and the table would otherwise grow one row per
// (ip, path) forever. An hour is a wide margin over the longest window (60s).
const ROW_TTL_MS = 60 * 60 * 1_000;
const PRUNE_INTERVAL_MS = 10 * 60 * 1_000;

let lastPruneAt = 0;

const pruneExpiredRows = async (now: number): Promise<void> => {
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  // Housekeeping, not part of the decision — a failure here must not 500 the
  // request that happened to trigger it.
  await db
    .delete(rateLimit)
    .where(lt(rateLimit.lastRequest, now - ROW_TTL_MS))
    .catch(() => undefined);
};

const readRow = async (key: string) => {
  const [row] = await db.select().from(rateLimit).where(eq(rateLimit.key, key));
  return row ?? null;
};

const retryAfterSeconds = (
  lastRequest: number,
  windowMs: number,
  now: number,
) => Math.ceil((lastRequest + windowMs - now) / 1_000);

/**
 * Betterauth rate-limit storage backed by a single upsert per request.
 *
 * Betterauth's own database storage reads then inserts: two requests sharing
 * a bucket key both see no row, both INSERT, and the loser 500s on
 * `rate_limit_key_unique` (issue #115). One statement removes that race by
 * construction.
 */
export const authRateLimitStorage: Required<RateLimitStorage> = {
  get: readRow,

  // Unreachable while `consume` exists — betterauth only falls back to
  // get/set without one — but the storage interface requires it.
  set: async (key, value) => {
    await db
      .insert(rateLimit)
      .values({
        id: crypto.randomUUID(),
        key,
        count: value.count,
        lastRequest: value.lastRequest,
      })
      .onConflictDoUpdate({
        target: rateLimit.key,
        set: { count: value.count, lastRequest: value.lastRequest },
      });
  },

  consume: async function consume(key, rule) {
    const now = Date.now();
    const windowMs = rule.window * 1_000;

    // The `where` carries the decision: it skips the update when the limit is
    // already spent inside the live window, and a skipped update returns no
    // rows. Denying that way also leaves `last_request` untouched, so a client
    // retrying while blocked can't keep pushing its own window forward.
    const updated = await db.execute<{ count: number }>(sql`
      insert into "rate_limit" ("id", "key", "count", "last_request")
      values (${crypto.randomUUID()}, ${key}, 1, ${now})
      on conflict ("key") do update set
        "count" = case
          when ${now} - "rate_limit"."last_request" > ${windowMs} then 1
          else "rate_limit"."count" + 1
        end,
        "last_request" = ${now}
      where ${now} - "rate_limit"."last_request" > ${windowMs}
         or "rate_limit"."count" < ${rule.max}
      returning "count"
    `);

    if (updated.rows.length > 0) {
      await pruneExpiredRows(now);
      return { allowed: true, retryAfter: null };
    }

    const row = await readRow(key);
    // Only reachable if the row was pruned between the two statements, which
    // means the window is gone and the next attempt starts a fresh one.
    if (!row) return consume(key, rule);

    return {
      allowed: false,
      retryAfter: retryAfterSeconds(row.lastRequest, windowMs, now),
    };
  },
};
