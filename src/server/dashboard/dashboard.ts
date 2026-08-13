import { Effect } from "effect";
import { gte } from "drizzle-orm";
import type { db as Db } from "../db";
import { diaryEntries } from "../db/schema";
import { computeConsumedMacros, sumMacros, type ConsumedMacros } from "../food/nutrient-scaling";
import { loadActiveWindowRows, type ActiveWindowRow } from "../logging/active-window-rows";
import { mealForLoggedAt, MEAL_NAMES, type MealName } from "./meal-bucket";
import { computeStreak } from "./streak";
import { addUtcDays, startOfUtcDay, toIsoDate } from "./date-window";

// Charts/macro-split/today's totals read a 7-day window (build-plan.md's
// "Dashboard & insights computation"). The streak reads a separate, longer
// window (below) — a habit streak that silently caps at 7 days defeats the
// point of a streak, so it isn't tied to the same window as everything else.
const ROLLING_WINDOW_DAYS = 7;
const STREAK_LOOKBACK_DAYS = 365;

export interface DashboardMealItem {
  readonly id: string;
  readonly foodName: string;
  readonly quantity: number;
  readonly quantityUnit: "g" | "ml" | "serving";
  readonly confidence: "confident" | "needs_review" | null;
  readonly calories: number;
}

export interface DashboardMealGroup {
  readonly meal: MealName;
  readonly items: ReadonlyArray<DashboardMealItem>;
}

export interface DashboardDayCalories {
  readonly date: string;
  readonly calories: number;
}

export interface DashboardSnapshot {
  readonly today: {
    readonly calories: number;
    readonly macros: { readonly proteinG: number; readonly carbsG: number; readonly fatG: number };
  };
  readonly meals: ReadonlyArray<DashboardMealGroup>;
  readonly streakDays: number;
  readonly calorieHistory: ReadonlyArray<DashboardDayCalories>;
  readonly macroSplit: { readonly proteinG: number; readonly carbsG: number; readonly fatG: number };
}

/**
 * On-demand aggregation (per build-plan.md's "Dashboard & insights
 * computation" — no rollup job): one query over the 7-day window for
 * today's meal-grouped log + calorie/macro-split charts, plus a separate,
 * cheap (loggedAt-only) query over a year for the streak, since a streak
 * needs a longer memory than a week to be worth displaying.
 */
export const getDashboardSnapshotEffect = (
  db: typeof Db,
  now: Date,
): Effect.Effect<DashboardSnapshot> =>
  Effect.gen(function* () {
    const todayStart = startOfUtcDay(now);
    const windowStart = addUtcDays(todayStart, -(ROLLING_WINDOW_DAYS - 1));
    const todayIso = toIsoDate(todayStart);

    const { rows: activeRows, nutrientsByFoodId } = yield* loadActiveWindowRows(db, windowStart);

    const macrosByItem = new Map<string, ConsumedMacros>(
      activeRows.map((row) => [
        row.itemId,
        computeConsumedMacros(
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

    const calorieHistory: DashboardDayCalories[] = [];
    for (let i = 0; i < ROLLING_WINDOW_DAYS; i++) {
      const date = toIsoDate(addUtcDays(windowStart, i));
      const dayRows = byDate.get(date) ?? [];
      const calories = dayRows.reduce(
        (sum, row) => sum + (macrosByItem.get(row.itemId)?.energyKcal ?? 0),
        0,
      );
      calorieHistory.push({ date, calories: Math.round(calories) });
    }

    const streakWindowStart = addUtcDays(todayStart, -(STREAK_LOOKBACK_DAYS - 1));
    const streakRows = yield* Effect.tryPromise(() =>
      db
        .select({ loggedAt: diaryEntries.loggedAt })
        .from(diaryEntries)
        .where(gte(diaryEntries.loggedAt, streakWindowStart)),
    ).pipe(Effect.orDie);
    const streakDates = new Set(streakRows.map((row) => toIsoDate(row.loggedAt)));
    const streakDays = computeStreak(streakDates, todayIso);

    const todayRows = byDate.get(todayIso) ?? [];
    const todayMacros = sumMacros(todayRows.map((row) => macrosByItem.get(row.itemId)!));

    const meals: DashboardMealGroup[] = MEAL_NAMES.map((meal) => ({
      meal,
      items: todayRows
        .filter((row) => mealForLoggedAt(row.loggedAt) === meal)
        .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime())
        .map((row) => ({
          id: row.itemId,
          foodName: row.foodName,
          quantity: row.quantity,
          quantityUnit: row.quantityUnit,
          confidence: row.confidence,
          calories: Math.round(macrosByItem.get(row.itemId)?.energyKcal ?? 0),
        })),
    }));

    const windowMacros = sumMacros(activeRows.map((row) => macrosByItem.get(row.itemId)!));

    return {
      today: {
        calories: Math.round(todayMacros.energyKcal),
        macros: {
          proteinG: Math.round(todayMacros.proteinG),
          carbsG: Math.round(todayMacros.carbsG),
          fatG: Math.round(todayMacros.fatG),
        },
      },
      meals,
      streakDays,
      calorieHistory,
      macroSplit: {
        proteinG: Math.round(windowMacros.proteinG),
        carbsG: Math.round(windowMacros.carbsG),
        fatG: Math.round(windowMacros.fatG),
      },
    };
  });
