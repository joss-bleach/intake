import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  ExtractedNutrient,
  NutritionFact,
  ParsedDescription,
  ParsedIngredient,
  ParsedLabelReading,
} from "../../../src/ai/schemas";

describe("ParsedDescription (Stage 2, description path)", () => {
  it("decodes a well-formed ingredient guess", () => {
    const decoded = Schema.decodeUnknownSync(ParsedDescription)({
      ingredients: [
        {
          name: "chicken breast",
          nameConfidence: "confident",
          quantity: 150,
          quantityUnit: "g",
          quantityConfidence: "needs_review",
        },
      ],
    });

    expect(decoded.ingredients[0]).toBeInstanceOf(ParsedIngredient);
    expect(decoded.ingredients[0].quantityConfidence).toBe("needs_review");
  });

  it("rejects an empty ingredients array — a description always guesses at least one", () => {
    expect(() =>
      Schema.decodeUnknownSync(ParsedDescription)({ ingredients: [] }),
    ).toThrow();
  });

  it("rejects a confidence value outside the confident/needs_review enum", () => {
    expect(() =>
      Schema.decodeUnknownSync(ParsedDescription)({
        ingredients: [
          {
            name: "rice",
            nameConfidence: "certain",
            quantity: 100,
            quantityUnit: "g",
            quantityConfidence: "confident",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects a non-positive quantity", () => {
    expect(() =>
      Schema.decodeUnknownSync(ParsedDescription)({
        ingredients: [
          {
            name: "rice",
            nameConfidence: "confident",
            quantity: 0,
            quantityUnit: "g",
            quantityConfidence: "confident",
          },
        ],
      }),
    ).toThrow();
  });
});

describe("ParsedLabelReading (Stage 2, label path)", () => {
  it("decodes a well-formed label read, brand/serving-size optional", () => {
    const decoded = Schema.decodeUnknownSync(ParsedLabelReading)({
      foodName: "Baked Beans",
      foodNameConfidence: "confident",
      basisUnit: "g",
      nutrients: [
        { code: "energy_kcal", value: 78, unit: "kcal", confidence: "confident" },
      ],
    });

    expect(decoded.brand).toBeUndefined();
    expect(decoded.servingSize).toBeUndefined();
    expect(decoded.nutrients[0]).toBeInstanceOf(ExtractedNutrient);
  });

  it("carries provenance on optional brand and serving size when present", () => {
    const decoded = Schema.decodeUnknownSync(ParsedLabelReading)({
      foodName: "Baked Beans",
      foodNameConfidence: "confident",
      brand: { value: "Heinz", confidence: "needs_review" },
      basisUnit: "g",
      servingSize: { value: 200, confidence: "confident" },
      nutrients: [
        { code: "energy_kcal", value: 78, unit: "kcal", confidence: "confident" },
      ],
    });

    expect(decoded.brand).toEqual({
      value: "Heinz",
      confidence: "needs_review",
    });
    expect(decoded.servingSize).toEqual({ value: 200, confidence: "confident" });
  });

  it("rejects an optional value supplied without its confidence tag", () => {
    expect(() =>
      Schema.decodeUnknownSync(ParsedLabelReading)({
        foodName: "Baked Beans",
        foodNameConfidence: "confident",
        brand: { value: "Heinz" },
        basisUnit: "g",
        nutrients: [
          {
            code: "energy_kcal",
            value: 78,
            unit: "kcal",
            confidence: "confident",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects a confidence tag supplied without the value it describes", () => {
    expect(() =>
      Schema.decodeUnknownSync(ParsedLabelReading)({
        foodName: "Baked Beans",
        foodNameConfidence: "confident",
        basisUnit: "g",
        servingSize: { confidence: "needs_review" },
        nutrients: [
          {
            code: "energy_kcal",
            value: 78,
            unit: "kcal",
            confidence: "confident",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects an empty nutrients array — a label read always extracts at least one value", () => {
    expect(() =>
      Schema.decodeUnknownSync(ParsedLabelReading)({
        foodName: "Baked Beans",
        foodNameConfidence: "confident",
        basisUnit: "g",
        nutrients: [],
      }),
    ).toThrow();
  });
});

describe("NutritionFact (Stage 3)", () => {
  it("decodes a database-sourced fact with no confidence tag", () => {
    const decoded = Schema.decodeUnknownSync(NutritionFact)({
      code: "energy_kcal",
      value: 250,
      unit: "kcal",
      source: "database",
    });

    expect(decoded.confidence).toBeUndefined();
  });

  it("decodes an llm_estimate_fallback fact carrying needs_review", () => {
    const decoded = Schema.decodeUnknownSync(NutritionFact)({
      code: "protein_g",
      value: 12,
      unit: "g",
      source: "llm_estimate_fallback",
      confidence: "needs_review",
    });

    expect(decoded.confidence).toBe("needs_review");
  });

  it("rejects a source outside the four provenance values", () => {
    expect(() =>
      Schema.decodeUnknownSync(NutritionFact)({
        code: "energy_kcal",
        value: 250,
        unit: "kcal",
        source: "guessed",
      }),
    ).toThrow();
  });
});
