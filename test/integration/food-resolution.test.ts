import path from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Layer } from "effect";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../../src/server/db";
import { foods, nutrientValues, foodLookupRateLimitWindows } from "../../src/server/db/schema";
import { migrate } from "../../src/server/db/migrate";
import { ingestCofidCsv } from "../../src/server/food/cofid-ingest";
import { ingestOffDump } from "../../src/server/food/off-ingest";
import { FoodNotFoundError, RateLimitExceededError } from "../../src/server/food/errors";
import { OffLiveClient, type OffLiveHit } from "../../src/server/food/off-client";
import { FoodLookupRateLimiter } from "../../src/server/food/rate-limiter";
import { resolveFood } from "../../src/server/food/resolve-food";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures",
);

// A live client double that records whether it was ever called — used to
// prove resolveFood's "no live OFF call on the normal path" guarantee, not
// just its result.
const offLiveClient = (hits: OffLiveHit[]) => {
  let calls = 0;
  const layer = Layer.succeed(OffLiveClient, {
    _tag: "OffLiveClient",
    search: () => {
      calls += 1;
      return Effect.succeed(hits);
    },
  });
  return { layer, wasCalled: () => calls > 0 };
};

const runResolve = (
  query: string,
  liveClientLayer: Layer.Layer<OffLiveClient>,
) =>
  Effect.runPromiseExit(
    resolveFood(query).pipe(
      Effect.provide(FoodLookupRateLimiter.Default),
      Effect.provide(liveClientLayer),
    ),
  );

describe("resolveFood", () => {
  beforeAll(async () => {
    await migrate();
    await ingestOffDump(path.join(fixturesDir, "off-sample.jsonl"));
    await ingestCofidCsv(path.join(fixturesDir, "cofid-sample.csv"));
  });

  afterEach(async () => {
    await db.delete(foodLookupRateLimitWindows);
  });

  afterAll(async () => {
    await db.delete(nutrientValues);
    await db.delete(foods);
    await db.delete(foodLookupRateLimitWindows);
    await pool.end();
  });

  it("resolves a known OFF product from the local cache, without a live call", async () => {
    const client = offLiveClient([]);
    const exit = await runResolve("Weetabix", client.layer);

    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") throw new Error("unreachable");
    expect(exit.value).toHaveLength(1);
    expect(exit.value[0]?.food.name).toBe("Weetabix Original");
    expect(exit.value[0]?.food.provenance).toBe("off");
    expect(client.wasCalled()).toBe(false);
  });

  it("resolves a known CoFID generic food from the local cache, without a live call", async () => {
    const client = offLiveClient([]);
    const exit = await runResolve("Banana", client.layer);

    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") throw new Error("unreachable");
    expect(exit.value).toHaveLength(1);
    expect(exit.value[0]?.food.name).toBe("Banana, raw");
    expect(exit.value[0]?.food.provenance).toBe("cofid");
    expect(client.wasCalled()).toBe(false);
  });

  it("falls back to a live lookup on a genuine cache miss, and caches the hit", async () => {
    const client = offLiveClient([
      {
        externalId: "9999999999999",
        name: "Live Fallback Oatcakes",
        brand: "Test Brand",
        basisUnit: "g",
        servingSize: "20",
        nutrients: [{ code: "energy_kcal", value: "400", unit: "g" }],
      },
    ]);

    const exit = await runResolve("Oatcakes That Are Not Cached", client.layer);

    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") throw new Error("unreachable");
    expect(exit.value).toHaveLength(1);
    expect(exit.value[0]?.food.name).toBe("Live Fallback Oatcakes");
    expect(exit.value[0]?.food.provenance).toBe("off");
    expect(client.wasCalled()).toBe(true);

    // Second call for the same query now hits the cache the first call wrote.
    const secondClient = offLiveClient([]);
    const secondExit = await runResolve(
      "Live Fallback Oatcakes",
      secondClient.layer,
    );
    expect(secondExit._tag).toBe("Success");
    if (secondExit._tag !== "Success") throw new Error("unreachable");
    expect(secondExit.value).toHaveLength(1);
    expect(secondClient.wasCalled()).toBe(false);
  });

  it("never serves an llm_estimate_fallback food as a cache hit", async () => {
    // A one-off fallback food written for an earlier gap ingredient: its
    // nutrition is an estimate for one description and quantity, so a later
    // matching query must miss the cache instead of reusing it.
    await db.insert(foods).values({
      name: "Grandma's Secret Casserole",
      provenance: "llm_estimate_fallback",
      basisUnit: "g",
    });

    const client = offLiveClient([]);
    const exit = await runResolve("Grandma's Secret Casserole", client.layer);

    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure") throw new Error("unreachable");
    expect(exit.cause._tag === "Fail" ? exit.cause.error : null).toBeInstanceOf(
      FoodNotFoundError,
    );
    expect(client.wasCalled()).toBe(true);
  });

  it("fails with FoodNotFoundError on a genuine miss (empty cache, empty live result)", async () => {
    const client = offLiveClient([]);
    const exit = await runResolve("Something Nobody Has Ever Logged", client.layer);

    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure") throw new Error("unreachable");
    const failure = exit.cause._tag === "Fail" ? exit.cause.error : null;
    expect(failure).toBeInstanceOf(FoodNotFoundError);
    expect(client.wasCalled()).toBe(true);
  });

  it("fails with RateLimitExceededError once the live-lookup rate limit is exhausted", async () => {
    const client = offLiveClient([]);

    // FOOD_LOOKUP_RATE_LIMIT_MAX defaults to 5 — exhaust it with genuine
    // misses (each one reaches the live path and consumes the limiter).
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await runResolve(`Rate limit filler ${attempt}`, client.layer);
    }

    const exit = await runResolve("One lookup too many", client.layer);

    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure") throw new Error("unreachable");
    const failure = exit.cause._tag === "Fail" ? exit.cause.error : null;
    expect(failure).toBeInstanceOf(RateLimitExceededError);
  });
});
