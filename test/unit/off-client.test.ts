import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OffLiveClient } from "../../src/server/food/off-client";

const searchResponse = (products: unknown[]) =>
  vi.fn(async () =>
    new Response(JSON.stringify({ products }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

const runSearch = (query: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* OffLiveClient;
      return yield* client.search(query);
    }).pipe(Effect.provide(OffLiveClient.Default)),
  );

describe("OffLiveClient.search", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps a product with tracked nutriments to a hit", async () => {
    vi.stubGlobal(
      "fetch",
      searchResponse([
        {
          code: "1111111111111",
          product_name: "Oatcakes",
          brands: "Test Brand",
          nutriments: { "energy-kcal_100g": 440, proteins_100g: 10 },
        },
      ]),
    );

    const hits = await runSearch("oatcakes");

    expect(hits).toHaveLength(1);
    expect(hits[0]?.name).toBe("Oatcakes");
    expect(hits[0]?.nutrients).toHaveLength(2);
  });

  it("drops products with none of the nutriments this app tracks", async () => {
    // resolveFood writes live hits straight into the cache, so a nutrientless
    // product must never become a hit: it would prune the food's existing
    // nutrients and then answer every later lookup from the cache.
    vi.stubGlobal(
      "fetch",
      searchResponse([
        { code: "2222222222222", product_name: "Mystery Snack" },
        {
          code: "3333333333333",
          product_name: "Untracked Only",
          nutriments: { sodium_100g: 1 },
        },
        {
          code: "4444444444444",
          product_name: "Real Food",
          nutriments: { "energy-kcal_100g": 100 },
        },
      ]),
    );

    const hits = await runSearch("snack");

    expect(hits.map((hit) => hit.name)).toEqual(["Real Food"]);
  });
});
