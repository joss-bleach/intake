import { describe, expect, it } from "vitest";
import {
  computeConsumedMacros,
  consumedBasisAmount,
  sumMacros,
} from "../../../../src/server/food/nutrient-scaling";
import { NUTRIENT_CODES } from "../../../../src/server/food/nutrient-codes";

const nutrients = [
  { code: NUTRIENT_CODES.energyKcal, value: 200 },
  { code: NUTRIENT_CODES.protein, value: 10 },
  { code: NUTRIENT_CODES.carbohydrate, value: 30 },
  { code: NUTRIENT_CODES.fat, value: 5 },
];

describe("consumedBasisAmount", () => {
  it("passes g/ml quantities through unchanged — already in basisUnit terms", () => {
    expect(consumedBasisAmount({ quantity: 150, quantityUnit: "g" }, { servingSize: null })).toBe(150);
  });

  it("converts a serving quantity via the food's serving size", () => {
    expect(
      consumedBasisAmount({ quantity: 2, quantityUnit: "serving" }, { servingSize: 40 }),
    ).toBe(80);
  });

  it("returns null for a serving quantity with no recorded serving size", () => {
    expect(
      consumedBasisAmount({ quantity: 2, quantityUnit: "serving" }, { servingSize: null }),
    ).toBeNull();
  });
});

describe("computeConsumedMacros", () => {
  it("scales per-100(basisUnit) nutrients by the logged quantity", () => {
    const macros = computeConsumedMacros(
      { quantity: 150, quantityUnit: "g" },
      { servingSize: null },
      nutrients,
    );
    expect(macros).toEqual({ energyKcal: 300, proteinG: 15, carbsG: 45, fatG: 7.5 });
  });

  it("degrades to all-zero macros for an unconvertible serving, rather than throwing", () => {
    const macros = computeConsumedMacros(
      { quantity: 1, quantityUnit: "serving" },
      { servingSize: null },
      nutrients,
    );
    expect(macros).toEqual({ energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });

  it("treats a missing nutrient code as zero rather than throwing", () => {
    const macros = computeConsumedMacros({ quantity: 100, quantityUnit: "g" }, { servingSize: null }, []);
    expect(macros).toEqual({ energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });
});

describe("sumMacros", () => {
  it("adds macros across multiple logged items", () => {
    const total = sumMacros([
      { energyKcal: 100, proteinG: 5, carbsG: 10, fatG: 2 },
      { energyKcal: 200, proteinG: 15, carbsG: 20, fatG: 8 },
    ]);
    expect(total).toEqual({ energyKcal: 300, proteinG: 20, carbsG: 30, fatG: 10 });
  });

  it("returns all-zero for an empty list", () => {
    expect(sumMacros([])).toEqual({ energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });
});
