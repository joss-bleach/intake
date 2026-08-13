import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { ParsedDescription, ParsedLabelReading } from "../../../src/ai/schemas";
import { DescriptionFixture, LabelFixture } from "../../../src/eval/fixtures";
import {
  aggregate,
  scoreDescriptionItem,
  scoreLabelItem,
} from "../../../src/eval/scoring";

const descriptionFixture = Schema.decodeUnknownSync(DescriptionFixture)({
  id: "description-chicken-rice",
  groundTruthReviewed: true,
  groundTruthSource: "hand-authored",
  input: "grilled chicken breast with rice",
  expected: {
    ingredients: [
      { name: "chicken breast", quantity: 150, quantityUnit: "g" },
      { name: "white rice", quantity: 160, quantityUnit: "g" },
    ],
  },
});

const parsedDescription = (overrides: Partial<{ chickenQty: number; riceName: string }> = {}) =>
  Schema.decodeUnknownSync(ParsedDescription)({
    ingredients: [
      {
        name: "chicken breast",
        nameConfidence: "confident",
        quantity: overrides.chickenQty ?? 150,
        quantityUnit: "g",
        quantityConfidence: "confident",
      },
      {
        name: overrides.riceName ?? "white rice",
        nameConfidence: "confident",
        quantity: 160,
        quantityUnit: "g",
        quantityConfidence: "needs_review",
      },
    ],
  });

describe("scoreDescriptionItem", () => {
  it("passes when every expected ingredient is matched within tolerance", () => {
    const result = scoreDescriptionItem(descriptionFixture, parsedDescription());

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when an expected ingredient is missing", () => {
    const result = scoreDescriptionItem(
      descriptionFixture,
      parsedDescription({ riceName: "quinoa" }),
    );

    expect(result.pass).toBe(false);
    expect(result.failures[0]).toContain("white rice");
  });

  it("fails when a quantity is outside the ±15% tolerance", () => {
    const result = scoreDescriptionItem(
      descriptionFixture,
      parsedDescription({ chickenQty: 200 }), // 150 -> 200 is +33%
    );

    expect(result.pass).toBe(false);
    expect(result.failures.some((f) => f.includes("chicken breast"))).toBe(
      true,
    );
  });

  it("counts needs_review fields without affecting pass/fail", () => {
    const result = scoreDescriptionItem(descriptionFixture, parsedDescription());

    expect(result.pass).toBe(true);
    expect(result.fieldsNeedingReview).toBe(1); // rice's quantityConfidence
  });
});

const labelFixture = Schema.decodeUnknownSync(LabelFixture)({
  id: "label-weetabix",
  groundTruthReviewed: true,
  groundTruthSource: "off:5010026500019",
  imageFile: "weetabix.jpg",
  imageMediaType: "image/jpeg",
  expected: {
    foodName: "Weetabix Original",
    brand: "Weetabix",
    basisUnit: "g",
    servingSize: 37.5,
    nutrients: [
      { code: "energy_kcal", value: 362, unit: "kcal" },
      { code: "protein_g", value: 12, unit: "g" },
    ],
  },
});

const parsedLabel = (
  overrides: Partial<{ energyKcal: number; foodName: string }> = {},
) =>
  Schema.decodeUnknownSync(ParsedLabelReading)({
    foodName: overrides.foodName ?? "Weetabix Original",
    foodNameConfidence: "confident",
    brand: { value: "Weetabix", confidence: "confident" },
    basisUnit: "g",
    servingSize: { value: 37.5, confidence: "confident" },
    nutrients: [
      {
        code: "energy_kcal",
        value: overrides.energyKcal ?? 362,
        unit: "kcal",
        confidence: "confident",
      },
      { code: "protein_g", value: 12, unit: "g", confidence: "needs_review" },
    ],
  });

describe("scoreLabelItem", () => {
  it("passes when every field is within ±2% tolerance", () => {
    const result = scoreLabelItem(labelFixture, parsedLabel());

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when a nutrient value is outside ±2% tolerance", () => {
    const result = scoreLabelItem(labelFixture, parsedLabel({ energyKcal: 400 }));

    expect(result.pass).toBe(false);
    expect(result.failures.some((f) => f.includes("energy_kcal"))).toBe(true);
  });

  it("tolerates the food name being read with the brand folded in", () => {
    const result = scoreLabelItem(
      labelFixture,
      parsedLabel({ foodName: "Weetabix Weetabix Original" }),
    );

    expect(result.pass).toBe(true);
  });

  it("fails when a missing nutrient can't be matched at all", () => {
    const parsed = Schema.decodeUnknownSync(ParsedLabelReading)({
      foodName: "Weetabix Original",
      foodNameConfidence: "confident",
      basisUnit: "g",
      nutrients: [
        { code: "energy_kcal", value: 362, unit: "kcal", confidence: "confident" },
      ],
    });

    const result = scoreLabelItem(labelFixture, parsed);

    expect(result.pass).toBe(false);
    expect(result.failures.some((f) => f.includes("protein_g"))).toBe(true);
  });

  it("fails when the read invents a nutrient the panel does not show", () => {
    const parsed = Schema.decodeUnknownSync(ParsedLabelReading)({
      foodName: "Weetabix Original",
      foodNameConfidence: "confident",
      brand: { value: "Weetabix", confidence: "confident" },
      basisUnit: "g",
      servingSize: { value: 37.5, confidence: "confident" },
      nutrients: [
        { code: "energy_kcal", value: 362, unit: "kcal", confidence: "confident" },
        { code: "protein_g", value: 12, unit: "g", confidence: "confident" },
        { code: "salt_g", value: 0.5, unit: "g", confidence: "confident" },
      ],
    });

    const result = scoreLabelItem(labelFixture, parsed);

    expect(result.pass).toBe(false);
    expect(result.failures).toContain('unexpected nutrient "salt_g"');
  });

  it("fails when the read invents a brand the panel does not print", () => {
    const fixture = Schema.decodeUnknownSync(LabelFixture)({
      id: "label-unbranded",
      groundTruthReviewed: true,
      groundTruthSource: "hand-authored",
      imageFile: "unbranded.jpg",
      imageMediaType: "image/jpeg",
      expected: {
        foodName: "Porridge Oats",
        basisUnit: "g",
        nutrients: [
          { code: "energy_kcal", value: 356, unit: "kcal" },
        ],
      },
    });
    const parsed = Schema.decodeUnknownSync(ParsedLabelReading)({
      foodName: "Porridge Oats",
      foodNameConfidence: "confident",
      brand: { value: "Quaker", confidence: "confident" },
      basisUnit: "g",
      servingSize: { value: 40, confidence: "confident" },
      nutrients: [
        { code: "energy_kcal", value: 356, unit: "kcal", confidence: "confident" },
      ],
    });

    const result = scoreLabelItem(fixture, parsed);

    expect(result.pass).toBe(false);
    expect(result.failures).toContain('unexpected brand "Quaker"');
    expect(result.failures).toContain("unexpected servingSize 40");
  });

  it("passes when the read omits a brand and serving size the panel does not print", () => {
    const fixture = Schema.decodeUnknownSync(LabelFixture)({
      id: "label-unbranded",
      groundTruthReviewed: true,
      groundTruthSource: "hand-authored",
      imageFile: "unbranded.jpg",
      imageMediaType: "image/jpeg",
      expected: {
        foodName: "Porridge Oats",
        basisUnit: "g",
        nutrients: [
          { code: "energy_kcal", value: 356, unit: "kcal" },
        ],
      },
    });
    const parsed = Schema.decodeUnknownSync(ParsedLabelReading)({
      foodName: "Porridge Oats",
      foodNameConfidence: "confident",
      basisUnit: "g",
      nutrients: [
        { code: "energy_kcal", value: 356, unit: "kcal", confidence: "confident" },
      ],
    });

    const result = scoreLabelItem(fixture, parsed);

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  // Validation is disabled deliberately: ParsedLabelReading now rejects a
  // repeated nutrient code at decode time (see test/unit/ai/schemas.test.ts),
  // so this shape can't be built through the decoder any more. Scoring keeps
  // its own check as the second line of defence, and this is what covers it.
  it("fails when a nutrient is read twice, even with conflicting values", () => {
    const parsed = new ParsedLabelReading(
      {
        foodName: "Weetabix Original",
        foodNameConfidence: "confident",
        brand: { value: "Weetabix", confidence: "confident" },
        basisUnit: "g",
        servingSize: { value: 37.5, confidence: "confident" },
        nutrients: [
          { code: "energy_kcal", value: 362, unit: "kcal", confidence: "confident" },
          { code: "energy_kcal", value: 136, unit: "kcal", confidence: "confident" },
          { code: "protein_g", value: 12, unit: "g", confidence: "confident" },
        ],
      },
      { disableValidation: true },
    );

    const result = scoreLabelItem(labelFixture, parsed);

    expect(result.pass).toBe(false);
    expect(result.failures).toContain('unexpected nutrient "energy_kcal"');
  });
});

describe("aggregate", () => {
  it("computes pass rate and gates against the floor", () => {
    const results = [
      { id: "a", pass: true, failures: [], fieldsNeedingReview: 0, groundTruthReviewed: true },
      { id: "b", pass: true, failures: [], fieldsNeedingReview: 1, groundTruthReviewed: true },
      { id: "c", pass: false, failures: ["x"], fieldsNeedingReview: 0, groundTruthReviewed: true },
    ];

    const agg = aggregate(results, 70);

    expect(agg.total).toBe(3);
    expect(agg.passed).toBe(2);
    expect(agg.passRate).toBeCloseTo(66.67, 1);
    expect(agg.meetsFloor).toBe(false); // 66.67 < 70
    expect(agg.itemsNeedingReview).toBe(1);
  });

  it("never claims the floor is met with zero fixtures", () => {
    const agg = aggregate([], 95);

    expect(agg.total).toBe(0);
    expect(agg.meetsFloor).toBe(false);
  });
});
