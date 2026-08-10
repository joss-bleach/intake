// PROTOTYPE — placeholder data standing in for the real rolling-7-day dashboard
// aggregation (see issue #13). Shape mirrors what that ticket settled: calories-vs-goal,
// a macro split, a 7-day logging streak, and a curated "more of / less of" NRV list.

export type DayLog = {
  label: string; // "Mon" etc
  date: string;
  calories: number;
  goal: number;
  logged: boolean;
};

export type Macro = {
  key: "protein" | "carbs" | "fat" | "fiber";
  label: string;
  grams: number;
  goalGrams: number;
  colorClass: string; // tailwind bg/text class per variant's own palette, filled in by each variant
};

export type NrvItem = {
  nutrient: string;
  pctOfNrv: number; // 100 = exactly on target, band is ±10
  direction: "more" | "less" | "on-target";
};

export const dashboardData = {
  userName: "Sam",
  today: {
    calories: 1640,
    goal: 2100,
    caloriesRemaining: 460,
  },
  streak: {
    currentDays: 5,
    days: [
      { label: "Mon", date: "Aug 4", calories: 1980, goal: 2100, logged: true },
      { label: "Tue", date: "Aug 5", calories: 2240, goal: 2100, logged: true },
      { label: "Wed", date: "Aug 6", calories: 1750, goal: 2100, logged: true },
      { label: "Thu", date: "Aug 7", calories: 0, goal: 2100, logged: false },
      { label: "Fri", date: "Aug 8", calories: 2050, goal: 2100, logged: true },
      { label: "Sat", date: "Aug 9", calories: 1890, goal: 2100, logged: true },
      { label: "Sun", date: "Aug 10", calories: 1640, goal: 2100, logged: true },
    ] as DayLog[],
  },
  macros: [
    { key: "protein", label: "Protein", grams: 98, goalGrams: 140 },
    { key: "carbs", label: "Carbs", grams: 165, goalGrams: 230 },
    { key: "fat", label: "Fat", grams: 52, goalGrams: 70 },
    { key: "fiber", label: "Fiber", grams: 19, goalGrams: 30 },
  ],
  nrv: [
    { nutrient: "Vitamin D", pctOfNrv: 42, direction: "more" },
    { nutrient: "Iron", pctOfNrv: 68, direction: "more" },
    { nutrient: "Calcium", pctOfNrv: 91, direction: "on-target" },
    { nutrient: "Sodium", pctOfNrv: 134, direction: "less" },
    { nutrient: "Fibre", pctOfNrv: 63, direction: "more" },
    { nutrient: "Saturated fat", pctOfNrv: 118, direction: "less" },
  ] as NrvItem[],
};
