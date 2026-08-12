import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, pool } from "../db";
import { foods, nutrientValues } from "../db/schema";
import { NUTRIENT_CODES } from "./nutrient-codes";

// Pre-warms the local cache from Open Food Facts' full JSONL export
// (`openfoodfacts-products.jsonl.gz`, one product object per line —
// world.openfoodfacts.org/data), filtered to UK-tagged products so the
// cache stays sized to what this app actually needs (issue #44's OFF
// research put UK coverage at ~3-4% of OFF's global ~4M products). Streamed
// line-by-line rather than parsed as one JSON array, since the full dump
// doesn't fit comfortably in memory.
//
// Idempotent by design: upserts on (provenance, external_id), so re-running
// this against a newer dump is exactly the "nightly delta-refresh" the
// ticket asks for — the real nightly *trigger* (a genuine OFF delta-diff
// feed, or a platform cron once infra is provisioned) is scaffolded but
// deferred to deploy, per the build-plan's infra-provisioning carve-out; see
// alchemy.run.ts.

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

const offDumpProduct = z.object({
  code: z.string(),
  product_name: z.string().nullish(),
  brands: z.string().nullish(),
  countries_tags: z.array(z.string()).optional(),
  product_quantity_unit: z.string().nullish(),
  serving_quantity: z.union([z.string(), z.number()]).nullish(),
  nutriments: offNutriments.optional(),
});

type OffDumpProduct = z.infer<typeof offDumpProduct>;

const isUk = (product: OffDumpProduct): boolean =>
  (product.countries_tags ?? []).includes("en:united-kingdom");

type OffNutrimentField = keyof z.infer<typeof offNutriments>;

const nutrientRows = (
  nutriments: z.infer<typeof offNutriments> | undefined,
): Array<{ code: string; value: number; unit: string }> => {
  if (!nutriments) return [];

  const fields: Array<[OffNutrimentField, string]> = [
    ["energy-kcal_100g", NUTRIENT_CODES.energyKcal],
    ["proteins_100g", NUTRIENT_CODES.protein],
    ["carbohydrates_100g", NUTRIENT_CODES.carbohydrate],
    ["sugars_100g", NUTRIENT_CODES.sugars],
    ["fat_100g", NUTRIENT_CODES.fat],
    ["saturated-fat_100g", NUTRIENT_CODES.saturatedFat],
    ["fiber_100g", NUTRIENT_CODES.fibre],
    ["salt_100g", NUTRIENT_CODES.salt],
  ];

  return fields.flatMap(([field, code]) => {
    const value = nutriments[field];
    return value === undefined ? [] : [{ code, value, unit: "g" }];
  });
};

export interface OffIngestSummary {
  readonly processed: number;
  readonly upserted: number;
  readonly skipped: number;
}

const upsertProduct = async (product: OffDumpProduct): Promise<boolean> => {
  const name = product.product_name;
  if (!name) return false;

  const nutrients = nutrientRows(product.nutriments);
  if (nutrients.length === 0) return false;

  const [food] = await db
    .insert(foods)
    .values({
      name,
      brand: product.brands ?? null,
      provenance: "off",
      externalId: product.code,
      basisUnit: product.product_quantity_unit === "ml" ? "ml" : "g",
      servingSize:
        product.serving_quantity === null ||
        product.serving_quantity === undefined
          ? null
          : String(product.serving_quantity),
    })
    .onConflictDoUpdate({
      target: [foods.provenance, foods.externalId],
      targetWhere: sql`${foods.externalId} is not null`,
      set: {
        name,
        brand: product.brands ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  for (const nutrient of nutrients) {
    await db
      .insert(nutrientValues)
      .values({
        foodId: food.id,
        code: nutrient.code,
        value: String(nutrient.value),
        unit: nutrient.unit,
        provenance: "database",
      })
      .onConflictDoUpdate({
        target: [nutrientValues.foodId, nutrientValues.code],
        targetWhere: sql`${nutrientValues.foodId} is not null`,
        set: { value: String(nutrient.value) },
      });
  }

  return true;
};

/** Streams `dumpPath` (a `.jsonl` file — decompress the `.gz` export first) and upserts every UK-tagged product it contains. */
export const ingestOffDump = async (
  dumpPath: string,
): Promise<OffIngestSummary> => {
  const lines = createInterface({
    input: createReadStream(dumpPath, { encoding: "utf-8" }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  let processed = 0;
  let upserted = 0;
  let skipped = 0;

  for await (const line of lines) {
    if (line.trim() === "") continue;
    processed += 1;

    const parsed = offDumpProduct.safeParse(JSON.parse(line));
    if (!parsed.success || !isUk(parsed.data)) {
      skipped += 1;
      continue;
    }

    const wrote = await upsertProduct(parsed.data);
    if (wrote) {
      upserted += 1;
    } else {
      skipped += 1;
    }
  }

  return { processed, upserted, skipped };
};

const runFromCli = (dumpPath: string): void => {
  ingestOffDump(dumpPath)
    .then(async (summary) => {
      console.log(summary);
      await pool.end();
    })
    .catch(async (error) => {
      console.error(error);
      await pool.end();
      process.exit(1);
    });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const dumpPath = process.argv[2];
  if (dumpPath === undefined) {
    console.error(
      "Usage: tsx src/server/food/off-ingest.ts <path-to-jsonl-dump>",
    );
    process.exit(1);
  } else {
    runFromCli(dumpPath);
  }
}
