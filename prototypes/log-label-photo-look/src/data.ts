// PROTOTYPE mock data — shape mirrors ADR 0001's Stage 2 `ParsedLabelReading`
// (per-field confidence enum "confident" | "needs_review", ticket #31's
// "extraction confidence" reading of that enum), not a real OCR call. Photo:
// a UK nutrition panel for a granola bar, printed per-100g + per-serving.
// Two fields misread on a glare/crease in the mock photo (sugars, salt) —
// that's the trust problem this screen exists to solve.

export type Confidence = "confident" | "needs_review";

export interface ParsedField<T> {
  value: T;
  confidence: Confidence;
}

export interface LabelNutrients {
  calories: ParsedField<number>;
  protein: ParsedField<number>;
  carbs: ParsedField<number>;
  sugars: ParsedField<number>;
  fat: ParsedField<number>;
  satFat: ParsedField<number>;
  fiber: ParsedField<number>;
  salt: ParsedField<number>;
}

export const labelReading = {
  productName: { value: "Oat & Berry Granola Bar", confidence: "confident" as Confidence },
  servingLabel: { value: "1 bar (40g)", confidence: "confident" as Confidence },
  // Per 100g, straight off the panel — shown for reference, not itself editable.
  per100g: {
    calories: 425,
    protein: 8,
    carbs: 62,
    sugars: 22,
    fat: 14,
    satFat: 2.1,
    fiber: 5,
    salt: 0.3,
  },
  // Per serving (40g), as extracted — these are the fields a user corrects.
  perServing: {
    calories: { value: 170, confidence: "confident" },
    protein: { value: 3.2, confidence: "confident" },
    carbs: { value: 25, confidence: "confident" },
    sugars: { value: 8.9, confidence: "needs_review" }, // glare over the last digit
    fat: { value: 5.6, confidence: "confident" },
    satFat: { value: 0.8, confidence: "confident" },
    fiber: { value: 2, confidence: "confident" },
    salt: { value: 0.12, confidence: "needs_review" }, // crease across the decimal
  } satisfies LabelNutrients,
};

// Position of each printed row on the mock photo, as a percentage of the
// photo's box — used by Variant C to place tap-pins directly over the digits
// they correspond to. Approximates where these rows actually sit on a real
// UK back-of-pack panel (Energy near the top, Salt at the bottom).
export const LABEL_ROW_POSITIONS: Record<keyof LabelNutrients, { top: string; left: string }> = {
  calories: { top: "22%", left: "78%" },
  fat: { top: "34%", left: "78%" },
  satFat: { top: "42%", left: "78%" },
  carbs: { top: "54%", left: "78%" },
  sugars: { top: "62%", left: "78%" },
  fiber: { top: "72%", left: "78%" },
  protein: { top: "82%", left: "78%" },
  salt: { top: "92%", left: "78%" },
};

export function scaledTotals(servings: number) {
  const p = labelReading.perServing;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    calories: Math.round(p.calories.value * servings),
    protein: round1(p.protein.value * servings),
    carbs: round1(p.carbs.value * servings),
    sugars: round1(p.sugars.value * servings),
    fat: round1(p.fat.value * servings),
    satFat: round1(p.satFat.value * servings),
    fiber: round1(p.fiber.value * servings),
    salt: round2(p.salt.value * servings),
  };
}

// Printed serving size, pulled out of servingLabel ("1 bar (40g)") — the
// anchor Variant A's unit toggle scales away from when the user switches to
// 100g or a custom gram amount.
export const SERVING_GRAMS = 40;

// Same shape as scaledTotals, but from the per-100g basis rather than the
// per-serving-as-read basis — lets Variant A's unit toggle (serving / 100g /
// grams) recompute totals for an arbitrary gram amount, not just serving
// multiples.
export function totalsForGrams(grams: number) {
  const p = labelReading.per100g;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const f = grams / 100;
  return {
    calories: Math.round(p.calories * f),
    protein: round1(p.protein * f),
    carbs: round1(p.carbs * f),
    sugars: round1(p.sugars * f),
    fat: round1(p.fat * f),
    satFat: round1(p.satFat * f),
    fiber: round1(p.fiber * f),
    salt: round2(p.salt * f),
  };
}

export function needsReviewFields(): (keyof LabelNutrients)[] {
  return (Object.keys(labelReading.perServing) as (keyof LabelNutrients)[]).filter(
    (k) => labelReading.perServing[k].confidence === "needs_review",
  );
}
