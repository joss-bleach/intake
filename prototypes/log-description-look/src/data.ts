// PROTOTYPE mock data — shape mirrors ADR 0001's Stage 3 NutritionFact +
// per-field confidence enum ("confident" | "needs_review"), not a real
// pipeline call. User typed: "grilled chicken breast with rice and steamed
// broccoli".

export type Confidence = "confident" | "needs_review";

export interface ParsedField<T> {
  value: T;
  confidence: Confidence;
}

export interface ParsedIngredient {
  id: string;
  name: string;
  quantity: ParsedField<string>;
  calories: ParsedField<number>;
  protein: ParsedField<number>;
  carbs: ParsedField<number>;
  fat: ParsedField<number>;
}

export const parsedDescription = {
  rawInput: "grilled chicken breast with rice and steamed broccoli",
  items: [
    {
      id: "chicken",
      name: "Grilled chicken breast",
      quantity: { value: "180g", confidence: "confident" },
      calories: { value: 297, confidence: "confident" },
      protein: { value: 42, confidence: "confident" },
      carbs: { value: 0, confidence: "confident" },
      fat: { value: 6, confidence: "confident" },
    },
    {
      id: "rice",
      name: "White rice, cooked",
      quantity: { value: "~150g", confidence: "needs_review" },
      calories: { value: 195, confidence: "needs_review" },
      protein: { value: 4, confidence: "needs_review" },
      carbs: { value: 42, confidence: "needs_review" },
      fat: { value: 0, confidence: "confident" },
    },
    {
      id: "broccoli",
      name: "Steamed broccoli",
      quantity: { value: "~80g", confidence: "needs_review" },
      calories: { value: 27, confidence: "needs_review" },
      protein: { value: 2, confidence: "needs_review" },
      carbs: { value: 5, confidence: "needs_review" },
      fat: { value: 0, confidence: "confident" },
    },
  ] satisfies ParsedIngredient[],
};

export function totals(items: ParsedIngredient[]) {
  return items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories.value,
      protein: acc.protein + item.protein.value,
      carbs: acc.carbs + item.carbs.value,
      fat: acc.fat + item.fat.value,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function needsReviewCount(items: ParsedIngredient[]) {
  return items.filter((i) =>
    [i.quantity, i.calories, i.protein, i.carbs, i.fat].some((f) => f.confidence === "needs_review"),
  ).length;
}
