// Macro-gram derivation (issue #45). Deliberately pure and DB-free: the
// stored `user_goals.macro_ratio` jsonb is *inputs* (preset + optional
// protein override), never derived grams — recomputing here on every read
// means a later calorie-goal or bodyweight edit can't leave stale macros
// behind. See src/server/routers/goals.ts for the DB-facing caller.

// Percentage-of-calories split per preset. Each must sum to 1 — enforced by
// the unit test, not the type system, since TS can't check numeric sums.
export const macroRatioPresets = {
  balanced: { protein: 0.3, carbs: 0.4, fat: 0.3 },
  high_protein: { protein: 0.4, carbs: 0.35, fat: 0.25 },
  low_carb: { protein: 0.3, carbs: 0.2, fat: 0.5 },
} as const;

export type MacroRatioPreset = keyof typeof macroRatioPresets;

export const macroRatioPresetNames = Object.keys(
  macroRatioPresets,
) as MacroRatioPreset[];

// The 1.6–2.2 g/kg-bodyweight range the acceptance criteria name — anything
// outside it isn't a "formula override", it's a typo.
export const proteinPerKgRange = { min: 1.6, max: 2.2 } as const;

export type ProteinOverride =
  | { readonly type: "grams"; readonly grams: number }
  | {
      readonly type: "per_kg_bodyweight";
      readonly gramsPerKg: number;
      readonly weightSource: "current" | "target";
    };

export type MacroRatio = {
  readonly preset: MacroRatioPreset;
  readonly proteinOverride: ProteinOverride | null;
};

export type Bodyweight = {
  readonly currentWeightKg: number | null;
  readonly targetWeightKg: number | null;
};

export type MacroGrams = {
  readonly proteinGrams: number;
  readonly carbsGrams: number;
  readonly fatGrams: number;
};

const caloriesPerGram = { protein: 4, carbs: 4, fat: 9 } as const;

/**
 * Derives protein/carb/fat grams for a calorie goal. Protein is resolved
 * first (preset ratio, a direct-gram override, or the g/kg-bodyweight
 * formula); carbs and fat then split whatever calories remain, in the
 * preset's relative carb:fat weighting — so overriding protein reshapes the
 * other two instead of leaving the preset's original gram values in place.
 *
 * A formula override whose weight source hasn't been recorded (bodyweight is
 * explicitly skippable at onboarding) falls back to the preset's protein
 * share rather than producing NaN/negative grams.
 */
export function deriveMacroGrams(
  calorieGoal: number,
  macroRatio: MacroRatio,
  bodyweight: Bodyweight,
): MacroGrams {
  const preset = macroRatioPresets[macroRatio.preset];
  const proteinGrams = resolveProteinGrams(
    calorieGoal,
    preset,
    macroRatio.proteinOverride,
    bodyweight,
  );

  const proteinCalories = proteinGrams * caloriesPerGram.protein;
  const remainingCalories = Math.max(calorieGoal - proteinCalories, 0);
  const carbFatWeight = preset.carbs + preset.fat;
  const carbShare = carbFatWeight === 0 ? 0.5 : preset.carbs / carbFatWeight;
  const carbCalories = remainingCalories * carbShare;
  const fatCalories = remainingCalories - carbCalories;

  return {
    proteinGrams: Math.round(proteinGrams),
    carbsGrams: Math.round(carbCalories / caloriesPerGram.carbs),
    fatGrams: Math.round(fatCalories / caloriesPerGram.fat),
  };
}

function presetProteinGrams(
  calorieGoal: number,
  preset: (typeof macroRatioPresets)[MacroRatioPreset],
): number {
  return (calorieGoal * preset.protein) / caloriesPerGram.protein;
}

function resolveProteinGrams(
  calorieGoal: number,
  preset: (typeof macroRatioPresets)[MacroRatioPreset],
  override: ProteinOverride | null,
  bodyweight: Bodyweight,
): number {
  if (override === null) {
    return presetProteinGrams(calorieGoal, preset);
  }
  if (override.type === "grams") {
    return override.grams;
  }

  const weightKg =
    override.weightSource === "target"
      ? bodyweight.targetWeightKg
      : bodyweight.currentWeightKg;

  return weightKg === null
    ? presetProteinGrams(calorieGoal, preset)
    : weightKg * override.gramsPerKg;
}
