import { NUTRIENT_CODES, type NutrientCode } from "./nutrient-codes";

// Every nutrient_values row is normalized to per-100(basisUnit) (schema.ts),
// regardless of which pipeline wrote it — this is the one place that scales
// a food's per-100 rate back up to what a given logged_items row actually
// contributed. Lives alongside nutrient-codes.ts (not under dashboard/)
// because it's a general domain concern, not a dashboard-only one —
// log-description.ts's getDiaryEntryEffect already notes a future
// log-history screen will need the same scaling.

export interface ConsumedMacros {
  readonly energyKcal: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
}

export interface NutrientRow {
  readonly code: string;
  readonly value: number;
}

export interface LoggedItemAmount {
  readonly quantity: number;
  readonly quantityUnit: "g" | "ml" | "serving";
}

export interface FoodBasis {
  readonly servingSize: number | null;
}

// A "serving" quantity is only convertible with the food's own serving size
// (same unit as its basisUnit); g/ml quantities are already in basisUnit
// terms. An unconvertible serving (no recorded serving size) contributes
// nothing rather than guessing a size — the caller sees a smaller total, not
// a wrong one.
export const consumedBasisAmount = (
  amount: LoggedItemAmount,
  food: FoodBasis,
): number | null => {
  if (amount.quantityUnit === "serving") {
    return food.servingSize === null ? null : amount.quantity * food.servingSize;
  }
  return amount.quantity;
};

const findValue = (nutrients: ReadonlyArray<NutrientRow>, code: string): number =>
  nutrients.find((n) => n.code === code)?.value ?? 0;

/**
 * Scales a food's per-100(basisUnit) nutrient rows by how much of it a
 * logged_items row actually recorded. Returns all-zero macros (rather than
 * throwing) for an unconvertible serving quantity — a dashboard total should
 * degrade, not break, on one un-convertible row.
 */
export const computeConsumedMacros = (
  amount: LoggedItemAmount,
  food: FoodBasis,
  nutrients: ReadonlyArray<NutrientRow>,
): ConsumedMacros => {
  const basisAmount = consumedBasisAmount(amount, food);
  if (basisAmount === null) {
    return { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  }

  const scale = basisAmount / 100;
  return {
    energyKcal: findValue(nutrients, NUTRIENT_CODES.energyKcal) * scale,
    proteinG: findValue(nutrients, NUTRIENT_CODES.protein) * scale,
    carbsG: findValue(nutrients, NUTRIENT_CODES.carbohydrate) * scale,
    fatG: findValue(nutrients, NUTRIENT_CODES.fat) * scale,
  };
};

export const sumMacros = (macros: ReadonlyArray<ConsumedMacros>): ConsumedMacros =>
  macros.reduce(
    (total, m) => ({
      energyKcal: total.energyKcal + m.energyKcal,
      proteinG: total.proteinG + m.proteinG,
      carbsG: total.carbsG + m.carbsG,
      fatG: total.fatG + m.fatG,
    }),
    { energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

// Same scaling as computeConsumedMacros, but over every NUTRIENT_CODES entry
// (insights' NRV comparison needs saturates/sugars/fibre/salt too, not just
// the 4-macro dashboard set).
export const computeConsumedNutrients = (
  amount: LoggedItemAmount,
  food: FoodBasis,
  nutrients: ReadonlyArray<NutrientRow>,
): Record<NutrientCode, number> => {
  const basisAmount = consumedBasisAmount(amount, food);
  const scale = basisAmount === null ? 0 : basisAmount / 100;
  return Object.fromEntries(
    Object.values(NUTRIENT_CODES).map((code) => [code, findValue(nutrients, code) * scale]),
  ) as Record<NutrientCode, number>;
};

export const sumNutrients = (
  rows: ReadonlyArray<Record<NutrientCode, number>>,
): Record<NutrientCode, number> =>
  rows.reduce(
    (total, row) => {
      for (const code of Object.values(NUTRIENT_CODES)) {
        total[code] += row[code];
      }
      return total;
    },
    Object.fromEntries(Object.values(NUTRIENT_CODES).map((code) => [code, 0])) as Record<
      NutrientCode,
      number
    >,
  );
