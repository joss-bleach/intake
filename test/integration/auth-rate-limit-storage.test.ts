import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../../src/server/db";
import { rateLimit } from "../../src/server/db/auth-schema";
import { migrate } from "../../src/server/db/migrate";
import { authRateLimitStorage } from "../../src/server/auth/rate-limit-storage";
import { createAuth } from "../../src/server/auth";

// Regression cover for issue #115: betterauth's own database storage does
// read-then-insert, so two requests sharing a bucket key both INSERT and the
// loser 500s on `rate_limit_key_unique`. Atomicity first, limit semantics
// second.
describe("authRateLimitStorage", () => {
  const rule = { window: 60, max: 5 };

  beforeAll(async () => {
    await migrate();
  });

  // Cleared before, not after: other integration files (app.test.ts) leave
  // live rate-limit rows behind, and these assertions count the whole table.
  beforeEach(async () => {
    await db.delete(rateLimit);
  });

  afterAll(async () => {
    await db.delete(rateLimit);
    await pool.end();
  });

  it("counts concurrent requests on a fresh key exactly once each", async () => {
    const concurrency = rule.max;

    const decisions = await Promise.all(
      Array.from({ length: concurrency }, () =>
        authRateLimitStorage.consume("1.2.3.4|/get-session", rule),
      ),
    );

    expect(decisions.every((decision) => decision.allowed)).toBe(true);
    const rows = await db.select().from(rateLimit);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(concurrency);
  });

  it("denies past the maximum, with a retry hint", async () => {
    for (let attempt = 0; attempt < rule.max; attempt += 1) {
      const decision = await authRateLimitStorage.consume("ip|/sign-in", rule);
      expect(decision.allowed).toBe(true);
    }

    const decision = await authRateLimitStorage.consume("ip|/sign-in", rule);

    expect(decision.allowed).toBe(false);
    expect(decision.retryAfter).toBeGreaterThan(0);
    expect(decision.retryAfter).toBeLessThanOrEqual(rule.window);
  });

  // A denied request must not push the window forward, or a client that keeps
  // retrying while blocked would never be let back in.
  it("keeps the count and the window pinned while denying", async () => {
    for (let attempt = 0; attempt <= rule.max; attempt += 1) {
      await authRateLimitStorage.consume("ip|/sign-in", rule);
    }
    const [afterFirstDenial] = await db.select().from(rateLimit);

    await authRateLimitStorage.consume("ip|/sign-in", rule);

    const [afterSecondDenial] = await db.select().from(rateLimit);
    expect(afterSecondDenial?.count).toBe(rule.max);
    expect(afterSecondDenial?.lastRequest).toBe(afterFirstDenial?.lastRequest);
  });

  it("starts a new window once the old one has elapsed", async () => {
    const key = "ip|/get-session";
    for (let attempt = 0; attempt <= rule.max; attempt += 1) {
      await authRateLimitStorage.consume(key, rule);
    }
    // Cheaper and more deterministic than waiting out a real window: age the
    // row past `window` and re-consume.
    await db
      .update(rateLimit)
      .set({ lastRequest: Date.now() - (rule.window + 1) * 1_000 })
      .where(eq(rateLimit.key, key));

    const decision = await authRateLimitStorage.consume(key, rule);

    expect(decision.allowed).toBe(true);
    const rows = await db.select().from(rateLimit);
    expect(rows[0]?.count).toBe(1);
  });

  it("buckets keys independently", async () => {
    for (let attempt = 0; attempt <= rule.max; attempt += 1) {
      await authRateLimitStorage.consume("attacker|/sign-in", rule);
    }

    const decision = await authRateLimitStorage.consume(
      "bystander|/sign-in",
      rule,
    );

    expect(decision.allowed).toBe(true);
  });

  // Proves the storage above is the one betterauth actually reaches: this is
  // the exact shape of INTAKE-1, several concurrent /get-session calls from
  // one client landing in the same fresh bucket.
  it("serves concurrent /get-session calls without a 500", async () => {
    const auth = createAuth(async () => {});
    const request = () =>
      auth.handler(
        new Request("http://localhost:3001/api/auth/get-session", {
          headers: { "cf-connecting-ip": "144.178.29.1" },
        }),
      );

    const responses = await Promise.all(
      Array.from({ length: 8 }, () => request()),
    );

    expect(responses.map((response) => response.status)).toEqual(
      Array.from({ length: 8 }, () => 200),
    );
    const rows = await db.select().from(rateLimit);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe("144.178.29.1|/get-session");
    expect(rows[0]?.count).toBe(8);
  });

  it("reads back what it wrote", async () => {
    await authRateLimitStorage.set("ip|/get-session", {
      key: "ip|/get-session",
      count: 3,
      lastRequest: 1_700_000_000_000,
    });

    expect(await authRateLimitStorage.get("ip|/get-session")).toMatchObject({
      key: "ip|/get-session",
      count: 3,
      lastRequest: 1_700_000_000_000,
    });
    expect(await authRateLimitStorage.get("ip|/absent")).toBeNull();
  });
});
