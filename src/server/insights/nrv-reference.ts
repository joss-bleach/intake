import { NUTRIENT_CODES, type NutrientCode } from "../food/nutrient-codes";

// UK/EU Nutrient Reference Values, adult daily intake (Regulation (EU) No
// 1169/2011, Annex XIII). Fibre has no official NRV, so it uses the UK SACN
// reference intake (30g/day) instead. Energy is excluded — the dashboard
// already compares calories against the user's own goal (issue #53).
export const NRV_REFERENCE = {
  [NUTRIENT_CODES.fat]: 70,
  [NUTRIENT_CODES.saturatedFat]: 20,
  [NUTRIENT_CODES.carbohydrate]: 260,
  [NUTRIENT_CODES.sugars]: 90,
  [NUTRIENT_CODES.protein]: 50,
  [NUTRIENT_CODES.salt]: 6,
  [NUTRIENT_CODES.fibre]: 30,
} satisfies Partial<Record<NutrientCode, number>>;

// Display names for the same curated set, keyed the same way as NRV_REFERENCE.
export const NRV_LABELS = {
  [NUTRIENT_CODES.fat]: "Fat",
  [NUTRIENT_CODES.saturatedFat]: "Saturates",
  [NUTRIENT_CODES.carbohydrate]: "Carbohydrate",
  [NUTRIENT_CODES.sugars]: "Sugars",
  [NUTRIENT_CODES.protein]: "Protein",
  [NUTRIENT_CODES.salt]: "Salt",
  [NUTRIENT_CODES.fibre]: "Fibre",
} satisfies Partial<Record<NutrientCode, string>>;

export type NrvDirection = "more" | "less" | "on-target";

// ±10% band around 100% counts as on target (issue #55's acceptance
// criteria) — outside it, the direction says which way to move.
export const directionForPct = (pct: number): NrvDirection => {
  if (pct < 90) return "more";
  if (pct > 110) return "less";
  return "on-target";
};
