import { addUtcDays, toIsoDate } from "./date-window";

// Consecutive-day logging streak (#39 story 36). Deliberately takes whatever
// date set the caller passes rather than owning its own lookback window —
// dashboard.ts queries a longer horizon for this than the 7-day window the
// rest of the dashboard reads, so a real multi-week streak isn't capped at 7.
//
// Not logging *yet* today doesn't zero the streak — a user who logged every
// day through yesterday still has that streak alive until today ends, so an
// empty today is skipped rather than treated as a break; any other missing
// day stops the count.
export const computeStreak = (
  loggedDates: ReadonlySet<string>,
  today: string,
): number => {
  let count = 0;
  let cursor = new Date(`${today}T00:00:00.000Z`);

  if (!loggedDates.has(today)) {
    cursor = addUtcDays(cursor, -1);
  }

  while (loggedDates.has(toIsoDate(cursor))) {
    count++;
    cursor = addUtcDays(cursor, -1);
  }

  return count;
};
