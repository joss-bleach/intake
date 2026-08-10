// PROTOTYPE — placeholder data for the Insights (more of / less of) screen (issue #32,
// child of the wayfinder map issue #1). Extends the NrvItem shape sketched in
// prototypes/dashboard-look/src/data.ts (nutrient, pctOfNrv, direction) to carry both a
// "today" and a "7-day rolling average" value, per the map's rolling-7-day-window decision,
// so the Day/Week toggle has something real to switch between.

export type Period = "today" | "week";

export type MacroKey = "protein" | "carbs" | "fat" | "fiber";

export type MacroLog = {
  key: MacroKey;
  label: string;
  grams: number;
  goalGrams: number;
};

// Approximate kcal-per-gram used only to size the donut wedges (Atwater factors;
// fibre uses the conventional ~2 kcal/g partial-energy figure). Not a nutrition claim,
// just enough to make the split visually plausible.
export const MACRO_KCAL_PER_GRAM: Record<MacroKey, number> = {
  protein: 4,
  carbs: 4,
  fat: 9,
  fiber: 2,
};

export type NrvDirection = "more" | "less" | "on-target";

// Curated fixed nutrient list for the "more of / less of" comparison. `nrvPct` is against
// the UK/EU Nutrient Reference Value; ±10% around 100% is the neutral "on-target" band —
// below 90% reads as "get more of", above 110% reads as "get less of" (deliberately
// direction-agnostic: works for both target nutrients like Iron, where the NRV is a healthy
// intake, and limit nutrients like Sodium, where the NRV is a ceiling not to be read as a
// goal to hit).
export type NrvItem = {
  nutrient: string;
  today: number; // % of NRV, today
  week: number; // % of NRV, 7-day rolling average
};

export function directionFor(pctOfNrv: number): NrvDirection {
  if (pctOfNrv < 90) return "more";
  if (pctOfNrv > 110) return "less";
  return "on-target";
}

export const insightsData = {
  userName: "Sam",
  calories: {
    today: { consumed: 1640, goal: 2100 },
    week: { consumed: 1921, goal: 2100 },
  },
  macros: {
    today: [
      { key: "protein", label: "Protein", grams: 98, goalGrams: 140 },
      { key: "carbs", label: "Carbs", grams: 165, goalGrams: 230 },
      { key: "fat", label: "Fat", grams: 52, goalGrams: 70 },
      { key: "fiber", label: "Fiber", grams: 19, goalGrams: 30 },
    ] as MacroLog[],
    week: [
      { key: "protein", label: "Protein", grams: 112, goalGrams: 140 },
      { key: "carbs", label: "Carbs", grams: 210, goalGrams: 230 },
      { key: "fat", label: "Fat", grams: 61, goalGrams: 70 },
      { key: "fiber", label: "Fiber", grams: 24, goalGrams: 30 },
    ] as MacroLog[],
  },
  nrv: [
    { nutrient: "Vitamin D", today: 38, week: 45 },
    { nutrient: "Iron", today: 72, week: 68 },
    { nutrient: "Calcium", today: 96, week: 102 },
    { nutrient: "Fibre", today: 61, week: 74 },
    { nutrient: "Potassium", today: 84, week: 93 },
    { nutrient: "Sodium", today: 128, week: 121 },
    { nutrient: "Saturated fat", today: 122, week: 108 },
    { nutrient: "Vitamin C", today: 158, week: 149 },
  ] as NrvItem[],
};
