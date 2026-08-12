import { describe, expect, it } from "vitest";
import {
  deriveMacroGrams,
  macroRatioPresets,
} from "../../src/server/goals/macros";

describe("macroRatioPresets", () => {
  for (const [name, ratio] of Object.entries(macroRatioPresets)) {
    it(`${name} sums to 100% of calories`, () => {
      expect(ratio.protein + ratio.carbs + ratio.fat).toBeCloseTo(1, 10);
    });
  }
});

describe("deriveMacroGrams", () => {
  const noBodyweight = { currentWeightKg: null, targetWeightKg: null };

  it("splits a calorie goal by the balanced preset ratio", () => {
    const macros = deriveMacroGrams(
      2000,
      { preset: "balanced", proteinOverride: null },
      noBodyweight,
    );

    // balanced: 30% protein, 40% carbs, 30% fat @ 4/4/9 kcal per gram
    expect(macros).toEqual({
      proteinGrams: 150, // 600 kcal / 4
      carbsGrams: 200, // 800 kcal / 4
      fatGrams: 67, // 600 kcal / 9, rounded
    });
  });

  it("uses a direct-gram protein override, reshaping carbs/fat around it", () => {
    const macros = deriveMacroGrams(
      2000,
      {
        preset: "balanced",
        proteinOverride: { type: "grams", grams: 180 },
      },
      noBodyweight,
    );

    // 180g protein = 720 kcal, leaving 1280 kcal split 40:30 (carbs:fat)
    expect(macros.proteinGrams).toBe(180);
    expect(macros.carbsGrams).toBe(183); // (1280 * 4/7) / 4, rounded
    expect(macros.fatGrams).toBe(61); // (1280 * 3/7) / 9, rounded
  });

  it("derives protein from current bodyweight via the g/kg formula", () => {
    const macros = deriveMacroGrams(
      2200,
      {
        preset: "high_protein",
        proteinOverride: {
          type: "per_kg_bodyweight",
          gramsPerKg: 2,
          weightSource: "current",
        },
      },
      { currentWeightKg: 80, targetWeightKg: 70 },
    );

    expect(macros.proteinGrams).toBe(160); // 80kg * 2g/kg
  });

  it("derives protein from target bodyweight via the g/kg formula", () => {
    const macros = deriveMacroGrams(
      2200,
      {
        preset: "high_protein",
        proteinOverride: {
          type: "per_kg_bodyweight",
          gramsPerKg: 1.8,
          weightSource: "target",
        },
      },
      { currentWeightKg: 80, targetWeightKg: 70 },
    );

    expect(macros.proteinGrams).toBe(126); // 70kg * 1.8g/kg
  });

  it("falls back to the preset ratio when the formula's weight source is unset", () => {
    const withFormula = deriveMacroGrams(
      2000,
      {
        preset: "balanced",
        proteinOverride: {
          type: "per_kg_bodyweight",
          gramsPerKg: 2,
          weightSource: "current",
        },
      },
      noBodyweight,
    );
    const withoutOverride = deriveMacroGrams(
      2000,
      { preset: "balanced", proteinOverride: null },
      noBodyweight,
    );

    expect(withFormula).toEqual(withoutOverride);
  });

  it("never lets an oversized protein override push remaining calories negative", () => {
    const macros = deriveMacroGrams(
      1500,
      {
        preset: "balanced",
        proteinOverride: { type: "grams", grams: 500 },
      },
      noBodyweight,
    );

    expect(macros.carbsGrams).toBe(0);
    expect(macros.fatGrams).toBe(0);
  });
});
