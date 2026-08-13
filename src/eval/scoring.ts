import type { ParsedDescription, ParsedLabelReading } from "../ai/schemas";
import type { DescriptionFixture, LabelFixture } from "./fixtures";
import { normalizeIdentity, sameIdentity, withinTolerance } from "./tolerance";

// Per-brief tolerance (docs/build-plan.md, ADR 0005): ±2% for a label read
// (the label already is the fact — the model's only job is transcription),
// ±15% for a description parse (an estimate from free text has more
// legitimate room to be "close enough").
export const LABEL_TOLERANCE = 0.02;
export const DESCRIPTION_TOLERANCE = 0.15;

// The brief's accuracy floor (docs/build-plan.md, ADR 0005) — a run.ts
// invocation exits nonzero (failing CI) when a pipeline's pass rate drops
// below its floor.
export const LABEL_ACCURACY_FLOOR = 95;
export const DESCRIPTION_ACCURACY_FLOOR = 85;

export interface ItemResult {
  readonly id: string;
  readonly pass: boolean;
  // Empty when pass is true. Human-readable, not machine-parsed — this is
  // report output, not a second scoring signal.
  readonly failures: readonly string[];
  // How many Stage 2 fields the model itself flagged `needs_review`.
  // Reported alongside pass/fail but never folds into it — the brief's
  // "needs_review tracked separately, doesn't gate CI" rule.
  readonly fieldsNeedingReview: number;
  // Pass-through from the fixture: was *this fixture's ground truth*
  // spot-checked/reviewed rather than fully verified. Surfaced the same way
  // — informational, not gating.
  readonly groundTruthReviewed: boolean;
}

export const scoreDescriptionItem = (
  fixture: DescriptionFixture,
  parsed: ParsedDescription,
): ItemResult => {
  const failures: string[] = [];
  const matchedIndexes = new Set<number>();

  for (const expected of fixture.expected.ingredients) {
    const matchIndex = parsed.ingredients.findIndex(
      (ingredient, index) =>
        !matchedIndexes.has(index) && sameIdentity(ingredient.name, expected.name),
    );
    if (matchIndex === -1) {
      failures.push(`missing ingredient "${expected.name}"`);
      continue;
    }
    matchedIndexes.add(matchIndex);
    const match = parsed.ingredients[matchIndex];
    if (match.quantityUnit !== expected.quantityUnit) {
      failures.push(
        `"${expected.name}" unit ${match.quantityUnit} !== expected ${expected.quantityUnit}`,
      );
    }
    if (
      !withinTolerance(
        match.quantity,
        expected.quantity,
        DESCRIPTION_TOLERANCE,
      )
    ) {
      failures.push(
        `"${expected.name}" quantity ${match.quantity} outside ±${DESCRIPTION_TOLERANCE * 100}% of expected ${expected.quantity}`,
      );
    }
  }

  // Anything the model parsed that wasn't matched to an expected ingredient
  // is a hallucination/duplicate — a description-parsing regression that
  // invents or repeats an ingredient the user never described, which
  // "recall of expected fields" alone wouldn't catch.
  parsed.ingredients.forEach((ingredient, index) => {
    if (!matchedIndexes.has(index)) {
      failures.push(`unexpected ingredient "${ingredient.name}"`);
    }
  });

  const fieldsNeedingReview = parsed.ingredients.reduce(
    (count, ingredient) =>
      count +
      (ingredient.nameConfidence === "needs_review" ? 1 : 0) +
      (ingredient.quantityConfidence === "needs_review" ? 1 : 0),
    0,
  );

  return {
    id: fixture.id,
    pass: failures.length === 0,
    failures,
    fieldsNeedingReview,
    groundTruthReviewed: fixture.groundTruthReviewed,
  };
};

// Label foodName tolerates one side being a substring of the other (e.g. a
// fixture's plain "Weetabix Original" against a model reading the printed
// brand into the same field, "Weetabix Weetabix Original") — exact
// normalized equality would fail transcriptions that are still, in
// substance, correct. An empty side never matches — `"x".includes("")` is
// always true in JS, which would otherwise let a blank (degraded-OCR)
// foodName/brand pass silently instead of failing.
const nameMatches = (actual: string, expected: string): boolean => {
  const a = normalizeIdentity(actual);
  const e = normalizeIdentity(expected);
  if (a === "" || e === "") return false;
  return a === e || a.includes(e) || e.includes(a);
};

export const scoreLabelItem = (
  fixture: LabelFixture,
  parsed: ParsedLabelReading,
): ItemResult => {
  const failures: string[] = [];
  const { expected } = fixture;

  if (!nameMatches(parsed.foodName, expected.foodName)) {
    failures.push(
      `foodName "${parsed.foodName}" !== expected "${expected.foodName}"`,
    );
  }

  if (expected.brand !== undefined) {
    if (
      !parsed.brand ||
      !nameMatches(parsed.brand.value, expected.brand)
    ) {
      failures.push(
        `brand "${parsed.brand?.value}" !== expected "${expected.brand}"`,
      );
    }
  }

  if (parsed.basisUnit !== expected.basisUnit) {
    failures.push(
      `basisUnit ${parsed.basisUnit} !== expected ${expected.basisUnit}`,
    );
  }

  if (expected.servingSize !== undefined) {
    if (
      !parsed.servingSize ||
      !withinTolerance(
        parsed.servingSize.value,
        expected.servingSize,
        LABEL_TOLERANCE,
      )
    ) {
      failures.push(
        `servingSize ${parsed.servingSize?.value} outside ±${LABEL_TOLERANCE * 100}% of expected ${expected.servingSize}`,
      );
    }
  }

  const matchedIndexes = new Set<number>();

  for (const expectedNutrient of expected.nutrients) {
    const matchIndex = parsed.nutrients.findIndex(
      (nutrient, index) =>
        !matchedIndexes.has(index) && nutrient.code === expectedNutrient.code,
    );
    if (matchIndex === -1) {
      failures.push(`missing nutrient "${expectedNutrient.code}"`);
      continue;
    }
    matchedIndexes.add(matchIndex);
    const match = parsed.nutrients[matchIndex];
    if (match.unit !== expectedNutrient.unit) {
      failures.push(
        `"${expectedNutrient.code}" unit ${match.unit} !== expected ${expectedNutrient.unit}`,
      );
    }
    if (
      !withinTolerance(match.value, expectedNutrient.value, LABEL_TOLERANCE)
    ) {
      failures.push(
        `"${expectedNutrient.code}" value ${match.value} outside ±${LABEL_TOLERANCE * 100}% of expected ${expectedNutrient.value}`,
      );
    }
  }

  // Same rule as the description scorer: a nutrient the model read that no
  // expected entry claimed is invented or duplicated data — a transcription
  // regression that recall of the expected codes alone would not catch.
  parsed.nutrients.forEach((nutrient, index) => {
    if (!matchedIndexes.has(index)) {
      failures.push(`unexpected nutrient "${nutrient.code}"`);
    }
  });

  const fieldsNeedingReview =
    (parsed.foodNameConfidence === "needs_review" ? 1 : 0) +
    (parsed.brand?.confidence === "needs_review" ? 1 : 0) +
    (parsed.servingSize?.confidence === "needs_review" ? 1 : 0) +
    parsed.nutrients.filter((n) => n.confidence === "needs_review").length;

  return {
    id: fixture.id,
    pass: failures.length === 0,
    failures,
    fieldsNeedingReview,
    groundTruthReviewed: fixture.groundTruthReviewed,
  };
};

export interface AggregateResult {
  readonly total: number;
  readonly passed: number;
  readonly passRate: number; // 0-100, NaN if total === 0
  readonly floorPct: number;
  readonly meetsFloor: boolean;
  readonly itemsNeedingReview: number; // count of items with >0 flagged fields
}

// The gate itself (docs/build-plan.md / ADR 0005): label reads ≥95/100,
// description parses ≥85/100. `floorPct` is a parameter, not baked in, so
// this same function scores both pipelines and any future one.
export const aggregate = (
  results: readonly ItemResult[],
  floorPct: number,
): AggregateResult => {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const passRate = total === 0 ? NaN : (passed / total) * 100;
  return {
    total,
    passed,
    passRate,
    floorPct,
    meetsFloor: total > 0 && passRate >= floorPct,
    itemsNeedingReview: results.filter((r) => r.fieldsNeedingReview > 0)
      .length,
  };
};
