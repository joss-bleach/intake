import { Effect } from "effect";
import { eq, gte, inArray } from "drizzle-orm";
import type { db as Db } from "../db";
import { diaryEntries, foods, loggedItems, nutrientValues } from "../db/schema";
import { computeConsumedMacros, sumMacros, type ConsumedMacros, type NutrientRow } from "../food/nutrient-scaling";
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

interface JoinedRow {
  readonly entryId: string;
  readonly loggedAt: Date;
  readonly itemId: string;
  readonly foodId: string;
  readonly foodName: string;
  readonly servingSize: number | null;
  readonly quantity: number;
  readonly quantityUnit: "g" | "ml" | "serving";
  readonly confidence: "confident" | "needs_review" | null;
  readonly correctedFromId: string | null;
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

    const rows = yield* Effect.tryPromise(() =>
      db
        .select({
          entryId: diaryEntries.id,
          loggedAt: diaryEntries.loggedAt,
          itemId: loggedItems.id,
          foodId: loggedItems.foodId,
          foodName: foods.name,
          servingSize: foods.servingSize,
          quantity: loggedItems.quantity,
          quantityUnit: loggedItems.quantityUnit,
          confidence: loggedItems.confidence,
          correctedFromId: loggedItems.correctedFromId,
        })
        .from(diaryEntries)
        .innerJoin(loggedItems, eq(loggedItems.diaryEntryId, diaryEntries.id))
        .innerJoin(foods, eq(loggedItems.foodId, foods.id))
        .where(gte(diaryEntries.loggedAt, windowStart)),
    ).pipe(Effect.orDie);

    const foodIds = [...new Set(rows.map((row) => row.foodId))];
    const nutrientRows = foodIds.length
      ? yield* Effect.tryPromise(() =>
          db.select().from(nutrientValues).where(inArray(nutrientValues.foodId, foodIds)),
        ).pipe(Effect.orDie)
      : [];
    const nutrientsByFoodId = new Map<string, NutrientRow[]>();
    for (const n of nutrientRows) {
      // nutrient_values.food_id is nullable in general (a row can instead
      // attach to a logged_item — schema.ts's exactly-one-parent check), but
      // this query filtered to foodIds, so it's never null here.
      if (n.foodId === null) continue;
      const bucket = nutrientsByFoodId.get(n.foodId) ?? [];
      bucket.push({ code: n.code, value: Number(n.value) });
      nutrientsByFoodId.set(n.foodId, bucket);
    }

    // A row that's been instance-corrected (schema.ts's correctedFromId) is
    // superseded by whichever row points back at it — kept for audit, but
    // excluded here so a correction doesn't double-count alongside the
    // original it replaced. No write path produces these yet (that's #50),
    // so today this is a no-op filter, not dead logic.
    const supersededIds = new Set(
      rows.map((row) => row.correctedFromId).filter((id): id is string => id !== null),
    );
    const activeRows: JoinedRow[] = rows
      .filter((row) => !supersededIds.has(row.itemId))
      .map((row) => ({
        ...row,
        servingSize: row.servingSize === null ? null : Number(row.servingSize),
        quantity: Number(row.quantity),
      }));

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

    const byDate = new Map<string, JoinedRow[]>();
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
