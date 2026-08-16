import { Effect } from "effect";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../../src/server/db";
import { modelCallRateLimitWindows } from "../../src/server/db/schema";
import { migrate } from "../../src/server/db/migrate";
import { env } from "../../src/server/env";
import {
  consumeModelCallBudget,
  ModelCallRateLimitExceededError,
} from "../../src/server/model-call-rate-limiter";

// The ceiling on what one account can spend of the OpenRouter budget — the
// only thing standing between a stolen session cookie and an unbounded bill,
// since every call it guards is a paid one.
describe("consumeModelCallBudget", () => {
  const max = env.MODEL_CALL_RATE_LIMIT_MAX;

  beforeAll(async () => {
    await migrate();
  });

  afterEach(async () => {
    await db.delete(modelCallRateLimitWindows);
  });

  afterAll(async () => {
    await pool.end();
  });

  const run = (subject: string) =>
    Effect.runPromiseExit(consumeModelCallBudget(subject));

  it("allows calls up to the configured maximum", async () => {
    for (let attempt = 0; attempt < max; attempt += 1) {
      const exit = await run("user-a");
      expect(exit._tag).toBe("Success");
    }
  });

  it("denies the call past the maximum, with a retry hint", async () => {
    for (let attempt = 0; attempt < max; attempt += 1) await run("user-a");

    const exit = await run("user-a");

    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure") throw new Error("unreachable");
    const failure = exit.cause._tag === "Fail" ? exit.cause.error : null;
    expect(failure).toBeInstanceOf(ModelCallRateLimitExceededError);
    expect((failure as ModelCallRateLimitExceededError).retryAfterMs).toBeGreaterThan(0);
  });

  // The reason this is keyed per subject rather than global like the
  // food-lookup limiter: one account burning its budget must not lock
  // everyone else out of logging a meal.
  it("keeps one subject's usage from denying another's", async () => {
    for (let attempt = 0; attempt <= max; attempt += 1) await run("user-a");

    const exit = await run("user-b");

    expect(exit._tag).toBe("Success");
  });

  // Concurrent requests must not both read a stale count and both squeak
  // under the limit — the upsert's row lock is what serializes them.
  it("counts concurrent calls exactly once each", async () => {
    await Promise.all(Array.from({ length: max }, () => run("user-a")));

    const rows = await db.select().from(modelCallRateLimitWindows);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(max);
  });
});
