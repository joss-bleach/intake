// Shared UTC-day arithmetic for the dashboard's date-bucketed queries
// (dashboard.ts's calorie history/meal grouping, streak.ts's streak walk) —
// one copy, so a day-boundary fix can't land in one and not the other.
export const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

export const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export const addUtcDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};
