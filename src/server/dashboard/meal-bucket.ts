// The data model has no meal field on diary_entries (per #8/#39's schema
// decisions) — "grouped by meal" (#53's acceptance criteria) is derived from
// the logged-at hour instead, UTC. Fixed boundaries, not user-configurable:
// simplest thing that gives every log a sensible bucket without adding a
// column and a settings screen for it.
export const MEAL_NAMES = ["breakfast", "lunch", "dinner", "snacks"] as const;
export type MealName = (typeof MEAL_NAMES)[number];

const MEAL_HOUR_RANGES: ReadonlyArray<{ meal: MealName; startHour: number }> = [
  { meal: "breakfast", startHour: 4 },
  { meal: "lunch", startHour: 11 },
  { meal: "dinner", startHour: 15 },
  { meal: "snacks", startHour: 21 },
];

export const mealForLoggedAt = (loggedAt: Date): MealName => {
  const hour = loggedAt.getUTCHours();
  // Ranges wrap past midnight (21:00-03:59 is all "snacks"), so this walks
  // backward from the latest range that starts at or before `hour`, falling
  // through to the last (wrapping) range when `hour` is before every start.
  for (let i = MEAL_HOUR_RANGES.length - 1; i >= 0; i--) {
    if (hour >= MEAL_HOUR_RANGES[i].startHour) {
      return MEAL_HOUR_RANGES[i].meal;
    }
  }
  return "snacks";
};
