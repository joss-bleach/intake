import { Effect } from "effect";
import type { db as Db } from "../db";
import { computeConsumedNutrients, sumNutrients } from "../food/nutrient-scaling";
import type { NutrientCode } from "../food/nutrient-codes";
import { loadActiveWindowRows, type ActiveWindowRow } from "../logging/active-window-rows";
import { addUtcDays, startOfUtcDay, toIsoDate } from "../dashboard/date-window";
import { directionForPct, NRV_LABELS, NRV_REFERENCE, type NrvDirection } from "./nrv-reference";

// Same window as the dashboard (#53) — on-demand aggregation, no rollup job.
const ROLLING_WINDOW_DAYS = 7;

export interface NrvComparisonItem {
  readonly code: string;
  readonly label: string;
  readonly pct: number;
  readonly direction: NrvDirection;
  readonly distanceFromTarget: number;
}

export interface InsightsPeriodSnapshot {
  readonly macroSplit: { readonly proteinG: number; readonly carbsG: number; readonly fatG: number };
  readonly nrvItems: ReadonlyArray<NrvComparisonItem>;
}

export interface InsightsSnapshot {
  readonly today: InsightsPeriodSnapshot;
  readonly week: InsightsPeriodSnapshot;
}

const nrvItemsFor = (totals: Record<NutrientCode, number>): NrvComparisonItem[] =>
  (Object.entries(NRV_REFERENCE) as [keyof typeof NRV_REFERENCE, number][]).map(([code, target]) => {
    const pct = Math.round((totals[code] / target) * 100);
    return {
      code,
      label: NRV_LABELS[code] ?? code,
      pct,
      direction: directionForPct(pct),
      distanceFromTarget: Math.abs(pct - 100),
    };
  });

/**
 * On-demand aggregation (no rollup job, matching dashboard.ts) for the
 * "more of / less of / on target" nutrient comparison. Day is today's raw
 * totals; Week is a rolling 7-day *average*, dividing by the number of days
 * actually logged in the window — not by 7 — so a day with no entries
 * doesn't drag the average toward zero (issue #55's zero-log-day exclusion).
 * needs_review items are included in both, unflagged.
 */
export const getInsightsSnapshotEffect = (
  db: typeof Db,
  now: Date,
): Effect.Effect<InsightsSnapshot> =>
  Effect.gen(function* () {
    const todayStart = startOfUtcDay(now);
    const windowStart = addUtcDays(todayStart, -(ROLLING_WINDOW_DAYS - 1));
    const todayIso = toIsoDate(todayStart);

    const { rows: activeRows, nutrientsByFoodId } = yield* loadActiveWindowRows(db, windowStart);

    const nutrientsByItem = new Map<string, Record<NutrientCode, number>>(
      activeRows.map((row) => [
        row.itemId,
        computeConsumedNutrients(
          { quantity: row.quantity, quantityUnit: row.quantityUnit },
          { servingSize: row.servingSize },
          nutrientsByFoodId.get(row.foodId) ?? [],
        ),
      ]),
    );

    const byDate = new Map<string, ActiveWindowRow[]>();
    for (const row of activeRows) {
      const date = toIsoDate(row.loggedAt);
      const bucket = byDate.get(date) ?? [];
      bucket.push(row);
      byDate.set(date, bucket);
    }

    const todayRows = byDate.get(todayIso) ?? [];
    const todayTotals = sumNutrients(todayRows.map((row) => nutrientsByItem.get(row.itemId)!));

    const loggedDayCount = byDate.size;
    const windowTotals = sumNutrients(activeRows.map((row) => nutrientsByItem.get(row.itemId)!));
    const weekAverages =
      loggedDayCount === 0
        ? windowTotals
        : (Object.fromEntries(
            Object.entries(windowTotals).map(([code, total]) => [code, total / loggedDayCount]),
          ) as Record<NutrientCode, number>);

    const round = (n: number) => Math.round(n);
    const macroSplit = (totals: Record<NutrientCode, number>) => ({
      proteinG: round(totals.protein_g ?? 0),
      carbsG: round(totals.carbohydrate_g ?? 0),
      fatG: round(totals.fat_g ?? 0),
    });

    return {
      today: { macroSplit: macroSplit(todayTotals), nrvItems: nrvItemsFor(todayTotals) },
      week: { macroSplit: macroSplit(weekAverages), nrvItems: nrvItemsFor(weekAverages) },
    };
  });
