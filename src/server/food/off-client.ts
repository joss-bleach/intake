import { Data, Effect } from "effect";
import { z } from "zod";
import type { NutrientCode, NutrientUnit } from "./nutrient-codes";
import { offNutriments, toOffNutrientRows } from "./off-nutriments";

// The rare live-lookup fallback resolveFood reaches for on a cache miss,
// gated by FoodLookupRateLimiter. Kept as its own Effect service (rather
// than a bare function) so tests can swap in a Layer that never touches the
// network — resolveFood's "no live OFF call on the normal path" guarantee
// depends on that boundary being real, not just conventionally respected.

export interface OffLiveHit {
  readonly externalId: string;
  readonly name: string;
  readonly brand: string | null;
  readonly basisUnit: "g" | "ml";
  readonly servingSize: string | null;
  readonly nutrients: ReadonlyArray<{
    readonly code: NutrientCode;
    readonly value: string;
    readonly unit: NutrientUnit;
  }>;
}

export class OffLiveSearchError extends Data.TaggedError(
  "OffLiveSearchError",
)<{
  readonly cause: unknown;
}> {}

// Only the fields this mapping reads, decoded at the boundary rather than
// trusted as `any` — OFF's full product shape is far larger than this.
const offProduct = z.object({
  code: z.string(),
  product_name: z.string().nullish(),
  brands: z.string().nullish(),
  product_quantity_unit: z.string().nullish(),
  serving_quantity: z.union([z.string(), z.number()]).nullish(),
  nutriments: offNutriments.optional(),
});

const offSearchResponse = z.object({
  products: z.array(offProduct),
});

const toHit = (product: z.infer<typeof offProduct>): OffLiveHit | null => {
  const name = product.product_name;
  if (!name) return null;

  return {
    externalId: product.code,
    name,
    brand: product.brands ?? null,
    basisUnit: product.product_quantity_unit === "ml" ? "ml" : "g",
    servingSize:
      product.serving_quantity === null || product.serving_quantity === undefined
        ? null
        : String(product.serving_quantity),
    nutrients: toOffNutrientRows(product.nutriments).map((nutrient) => ({
      code: nutrient.code,
      value: String(nutrient.value),
      unit: nutrient.unit,
    })),
  };
};

export class OffLiveClient extends Effect.Service<OffLiveClient>()(
  "OffLiveClient",
  {
    effect: Effect.sync(() => {
      // OFF's UK-hosted search endpoint, restricted to UK-tagged products —
      // matching the pre-warm's own country filter (see off-ingest.ts) so
      // the live fallback never widens the app's food set beyond what the
      // rest of #44 promises to cover.
      const search = (
        query: string,
      ): Effect.Effect<OffLiveHit[], OffLiveSearchError> =>
        Effect.tryPromise({
          try: async () => {
            const url = new URL("https://uk.openfoodfacts.org/cgi/search.pl");
            url.searchParams.set("search_terms", query);
            url.searchParams.set("json", "1");
            url.searchParams.set("page_size", "5");
            url.searchParams.set("tagtype_0", "countries");
            url.searchParams.set("tag_contains_0", "contains");
            url.searchParams.set("tag_0", "united-kingdom");

            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`OFF search responded ${response.status}`);
            }

            const parsed = offSearchResponse.parse(await response.json());
            return parsed.products
              .map(toHit)
              .filter((hit): hit is OffLiveHit => hit !== null);
          },
          catch: (cause) => new OffLiveSearchError({ cause }),
        });

      return { search } as const;
    }),
  },
) {}
