import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../../src/server/db";
import { foods, nutrientValues } from "../../src/server/db/schema";
import { ingestCofidCsv } from "../../src/server/food/cofid-ingest";
import { ingestOffDump } from "../../src/server/food/off-ingest";
import { migrate } from "../../src/server/db/migrate";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures",
);

// Exercises both one-time/pre-warm ingestion paths from issue #44 against
// small, committed fixture files (see test/fixtures/) rather than the real
// OFF dump or CoFID spreadsheet — pulling and loading the real datasets is
// build-phase data-provisioning work (see the MVP spec's carve-out), not
// something this suite re-does; what's tested here is that the ingestion
// code itself does the right thing with real Postgres.
describe("food ingestion", () => {
  beforeAll(async () => {
    await migrate();
  });

  afterEach(async () => {
    await db.delete(nutrientValues);
    await db.delete(foods);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("ingests only UK-tagged OFF products with usable nutrient data", async () => {
    const summary = await ingestOffDump(
      path.join(fixturesDir, "off-sample.jsonl"),
    );

    expect(summary).toEqual({ processed: 4, upserted: 2, skipped: 2 });

    const rows = await db.select().from(foods).where(eq(foods.provenance, "off"));
    expect(rows.map((row) => row.name).sort()).toEqual([
      "Cheddar Cheese, Mature",
      "Weetabix Original",
    ]);
  });

  it("is idempotent — re-ingesting the same dump upserts rather than duplicates", async () => {
    await ingestOffDump(path.join(fixturesDir, "off-sample.jsonl"));
    await ingestOffDump(path.join(fixturesDir, "off-sample.jsonl"));

    const rows = await db.select().from(foods).where(eq(foods.provenance, "off"));
    expect(rows).toHaveLength(2);
  });

  it("ingests CoFID rows into foods/nutrient_values, source-tagged cofid", async () => {
    const summary = await ingestCofidCsv(
      path.join(fixturesDir, "cofid-sample.csv"),
    );

    expect(summary).toEqual({ processed: 3, upserted: 3, skipped: 0 });

    const [rice] = await db
      .select()
      .from(foods)
      .where(eq(foods.externalId, "17-165"));
    expect(rice.provenance).toBe("cofid");
    expect(rice.name).toBe("Rice, white, easy cook, boiled in unsalted water");

    const values = await db
      .select()
      .from(nutrientValues)
      .where(eq(nutrientValues.foodId, rice.id));
    const energy = values.find((value) => value.code === "energy_kcal");
    expect(energy?.value).toBe("138");

    // CoFID reports sodium (mg), not salt — this locks in the conversion to
    // the shared salt_g code (salt = sodium × 2.5 / 1000) so a CoFID food's
    // salt_g means the same substance, in the same unit, as an OFF food's.
    const salt = values.find((value) => value.code === "salt_g");
    expect(salt?.unit).toBe("g");
    expect(Number(salt?.value)).toBeCloseTo(0.0075);
  });
});
