import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { foods, nutrientValues } from "../db/schema";
import { NUTRIENT_CODES } from "./nutrient-codes";

// One-time load of the UK's CoFID (~3,200 generic foods, gov.uk) into the
// same foods/nutrient_values tables OFF pre-warms, source-tagged `cofid`.
// CoFID ships only as an Excel spreadsheet (no API — see
// docs/research/open-food-facts-uk-coverage.md), so this expects that
// spreadsheet's main data sheet exported to CSV first (Excel/LibreOffice
// "Save As > CSV", or `ssconvert cofid.xlsx cofid.csv`) with the header row
// below. Column names are CoFID's own where the main dataset uses them
// verbatim; adjust the header map if a specific CoFID release names a column
// differently — the actual one-time load against the real file is
// build-phase/data-provisioning work (see the MVP spec's "Open Food Facts
// data pull" carve-out, which covers CoFID too), not re-verified here.
const CSV_COLUMNS = {
  code: "Food Code",
  name: "Food Name",
  energyKcal: "Energy (kcal) (kcal)",
  protein: "Protein (g)",
  carbohydrate: "Carbohydrate (g)",
  sugars: "Total sugars (g)",
  fat: "Fat (g)",
  saturatedFat: "Saturated fatty acids (g)",
  fibre: "AOAC fibre (g)",
  salt: "Sodium (mg)",
} as const;

// A cell can legitimately contain a comma inside quotes (e.g. `"Bread,
// white"`) — CoFID food names do this — so this is a small quote-aware
// splitter rather than a bare `split(",")`.
const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
};

// CoFID marks a value as trace ("Tr"), not-detected ("N"), or not measured
// ("-") rather than leaving it blank — none of those are a real quantity, so
// this drops the field rather than logging 0.
const parseNumericCell = (cell: string): number | null => {
  const parsed = Number(cell);
  return Number.isFinite(parsed) ? parsed : null;
};

export interface CofidIngestSummary {
  readonly processed: number;
  readonly upserted: number;
  readonly skipped: number;
}

/** Streams `csvPath` (CoFID's macronutrient sheet, converted to CSV — see the header comment above) and upserts every row into the food cache, source-tagged `cofid`. */
export const ingestCofidCsv = async (
  csvPath: string,
): Promise<CofidIngestSummary> => {
  const lines = createInterface({
    input: createReadStream(csvPath, { encoding: "utf-8" }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  let header: string[] | null = null;
  let processed = 0;
  let upserted = 0;
  let skipped = 0;

  for await (const line of lines) {
    if (line.trim() === "") continue;

    const cells = parseCsvLine(line);
    if (header === null) {
      header = cells;
      continue;
    }
    processed += 1;

    const row = Object.fromEntries(
      header.map((column, index) => [column, cells[index] ?? ""]),
    );

    const code = row[CSV_COLUMNS.code];
    const name = row[CSV_COLUMNS.name];
    if (!code || !name) {
      skipped += 1;
      continue;
    }

    const nutrients: Array<{ code: string; value: number; unit: string }> = [
      [CSV_COLUMNS.energyKcal, NUTRIENT_CODES.energyKcal, "g"],
      [CSV_COLUMNS.protein, NUTRIENT_CODES.protein, "g"],
      [CSV_COLUMNS.carbohydrate, NUTRIENT_CODES.carbohydrate, "g"],
      [CSV_COLUMNS.sugars, NUTRIENT_CODES.sugars, "g"],
      [CSV_COLUMNS.fat, NUTRIENT_CODES.fat, "g"],
      [CSV_COLUMNS.saturatedFat, NUTRIENT_CODES.saturatedFat, "g"],
      [CSV_COLUMNS.fibre, NUTRIENT_CODES.fibre, "g"],
      [CSV_COLUMNS.salt, NUTRIENT_CODES.salt, "mg"],
    ]
      .map(([csvColumn, nutrientCode, unit]) => {
        const value = parseNumericCell(row[csvColumn] ?? "");
        return value === null ? null : { code: nutrientCode, value, unit };
      })
      .filter(
        (nutrient): nutrient is { code: string; value: number; unit: string } =>
          nutrient !== null,
      );

    if (nutrients.length === 0) {
      skipped += 1;
      continue;
    }

    const [food] = await db
      .insert(foods)
      .values({
        name,
        provenance: "cofid",
        externalId: code,
        basisUnit: "g",
      })
      .onConflictDoUpdate({
        target: [foods.provenance, foods.externalId],
        targetWhere: sql`${foods.externalId} is not null`,
        set: { name, updatedAt: new Date() },
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

    upserted += 1;
  }

  return { processed, upserted, skipped };
};

const runFromCli = (csvPath: string): void => {
  ingestCofidCsv(csvPath)
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
  const csvPath = process.argv[2];
  if (csvPath === undefined) {
    console.error("Usage: tsx src/server/food/cofid-ingest.ts <path-to-csv>");
    process.exit(1);
  } else {
    runFromCli(csvPath);
  }
}
