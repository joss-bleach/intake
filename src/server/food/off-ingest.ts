import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, pool } from "../db";
import { foods } from "../db/schema";
import { writeFoodNutrients } from "./nutrient-values";
import { offNutriments, toOffNutrientRows } from "./off-nutriments";

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

export interface OffIngestSummary {
  readonly processed: number;
  readonly upserted: number;
  readonly skipped: number;
}

const upsertProduct = async (product: OffDumpProduct): Promise<boolean> => {
  const name = product.product_name;
  if (!name) return false;

  const nutrients = toOffNutrientRows(product.nutriments);
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

  await writeFoodNutrients(
    food.id,
    nutrients.map((nutrient) => ({
      code: nutrient.code,
      value: String(nutrient.value),
      unit: nutrient.unit,
    })),
  );

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
