import { z } from "zod";
import { NUTRIENT_CODES, type NutrientCode } from "./nutrient-codes";

// Shared between off-ingest.ts (the bulk dump pre-warm) and off-client.ts
// (the rare live-lookup fallback) — both read the same OFF product shape and
// must map its per-100g nutriment fields onto NUTRIENT_CODES identically, so
// the mapping lives once here rather than as two copies that could drift.
export const offNutriments = z.object({
  "energy-kcal_100g": z.number().optional(),
  proteins_100g: z.number().optional(),
  carbohydrates_100g: z.number().optional(),
  sugars_100g: z.number().optional(),
  fat_100g: z.number().optional(),
  "saturated-fat_100g": z.number().optional(),
  fiber_100g: z.number().optional(),
  salt_100g: z.number().optional(),
});

type OffNutriments = z.infer<typeof offNutriments>;
type OffNutrimentField = keyof OffNutriments;

const FIELD_TO_CODE: ReadonlyArray<[OffNutrimentField, NutrientCode]> = [
  ["energy-kcal_100g", NUTRIENT_CODES.energyKcal],
  ["proteins_100g", NUTRIENT_CODES.protein],
  ["carbohydrates_100g", NUTRIENT_CODES.carbohydrate],
  ["sugars_100g", NUTRIENT_CODES.sugars],
  ["fat_100g", NUTRIENT_CODES.fat],
  ["saturated-fat_100g", NUTRIENT_CODES.saturatedFat],
  ["fiber_100g", NUTRIENT_CODES.fibre],
  ["salt_100g", NUTRIENT_CODES.salt],
];

export interface OffNutrientRow {
  readonly code: NutrientCode;
  readonly value: number;
  readonly unit: "g";
}

/** Every OFF nutriment field this app tracks, mapped to `NUTRIENT_CODES` — fields absent from `nutriments` are omitted, not zeroed. */
export const toOffNutrientRows = (
  nutriments: OffNutriments | undefined,
): OffNutrientRow[] => {
  if (!nutriments) return [];

  return FIELD_TO_CODE.flatMap(([field, code]) => {
    const value = nutriments[field];
    return value === undefined ? [] : [{ code, value, unit: "g" as const }];
  });
};
