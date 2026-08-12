import { Data, Effect } from "effect";
import { z } from "zod";
import { NUTRIENT_CODES } from "./nutrient-codes";

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
    readonly code: (typeof NUTRIENT_CODES)[keyof typeof NUTRIENT_CODES];
    readonly value: string;
    readonly unit: string;
  }>;
}

export class OffLiveSearchError extends Data.TaggedError(
  "OffLiveSearchError",
)<{
  readonly cause: unknown;
}> {}

// Only the fields this mapping reads, decoded at the boundary rather than
// trusted as `any` — OFF's full product shape is far larger than this.
const offNutriments = z.object({
  "energy-kcal_100g": z.number().optional(),
  proteins_100g: z.number().optional(),
  carbohydrates_100g: z.number().optional(),
  sugars_100g: z.number().optional(),
  fat_100g: z.number().optional(),
  "saturated-fat_100g": z.number().optional(),
  fiber_100g: z.number().optional(),
  salt_100g: z.number().optional(),
});

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

type NutrientCode = OffLiveHit["nutrients"][number]["code"];
type OffNutrimentField = keyof z.infer<typeof offNutriments>;

const toNutrients = (
  nutriments: z.infer<typeof offNutriments> | undefined,
): OffLiveHit["nutrients"] => {
  if (!nutriments) return [];

  const entries: Array<[OffNutrimentField, NutrientCode]> = [
    ["energy-kcal_100g", NUTRIENT_CODES.energyKcal],
    ["proteins_100g", NUTRIENT_CODES.protein],
    ["carbohydrates_100g", NUTRIENT_CODES.carbohydrate],
    ["sugars_100g", NUTRIENT_CODES.sugars],
    ["fat_100g", NUTRIENT_CODES.fat],
    ["saturated-fat_100g", NUTRIENT_CODES.saturatedFat],
    ["fiber_100g", NUTRIENT_CODES.fibre],
    ["salt_100g", NUTRIENT_CODES.salt],
  ];

  return entries.flatMap(([field, code]) => {
    const value = nutriments[field];
    return value === undefined
      ? []
      : [{ code, value: String(value), unit: "g" }];
  });
};

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
    nutrients: toNutrients(product.nutriments),
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
