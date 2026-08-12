// Shared nutrient vocabulary for anything writing to `nutrient_values.code`
// from a food-database source (OFF ingestion, CoFID ingestion, the live
// cache-miss fallback in resolveFood). Deliberately small — just the macro
// set both OFF and CoFID reliably carry — rather than every field either
// source can theoretically expose; a food's row in `nutrient_values` is
// already narrow-shaped for that reason (see schema.ts), so this only fixes
// the *names* other code should agree on, not an exhaustive catalog.
export const NUTRIENT_CODES = {
  energyKcal: "energy_kcal",
  protein: "protein_g",
  carbohydrate: "carbohydrate_g",
  sugars: "sugars_g",
  fat: "fat_g",
  saturatedFat: "saturated_fat_g",
  fibre: "fibre_g",
  salt: "salt_g",
} as const;

export type NutrientCode = (typeof NUTRIENT_CODES)[keyof typeof NUTRIENT_CODES];

// The unit each code's value is always stored in, so `nutrient_values.unit`
// can't drift per ingestion path. Every macro here is a mass in grams
// *except* energy, which is a kilocalorie count — writing that as "g" would
// hand consumers a mass measurement to render and add up.
export const NUTRIENT_UNITS = {
  [NUTRIENT_CODES.energyKcal]: "kcal",
  [NUTRIENT_CODES.protein]: "g",
  [NUTRIENT_CODES.carbohydrate]: "g",
  [NUTRIENT_CODES.sugars]: "g",
  [NUTRIENT_CODES.fat]: "g",
  [NUTRIENT_CODES.saturatedFat]: "g",
  [NUTRIENT_CODES.fibre]: "g",
  [NUTRIENT_CODES.salt]: "g",
} as const satisfies Record<NutrientCode, string>;

export type NutrientUnit = (typeof NUTRIENT_UNITS)[NutrientCode];

export const unitForNutrient = (code: NutrientCode): NutrientUnit =>
  NUTRIENT_UNITS[code];
