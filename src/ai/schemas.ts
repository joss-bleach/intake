import { Schema } from "effect";

// Shared LLM-output contract (ADR 0001, issue #43): raw model response ->
// Effect-Schema-validated Stage 2 intermediate -> trusted Stage 3
// NutritionFact. Stage 2 is pipeline-specific — ParsedDescription for the
// description path's ingredient/quantity guesses, ParsedLabelReading for
// the label path's OCR nutrient extraction — because one pipeline estimates
// and the other transcribes an already-printed fact. What's shared is the
// pattern: every field carries a per-field "confident" | "needs_review"
// provenance tag, not a numeric score (ADR 0001 rejected the latter — no
// settled method yet for deriving a trustworthy score).
export const ConfidenceLevel = Schema.Literal("confident", "needs_review");
export type ConfidenceLevel = typeof ConfidenceLevel.Type;

// Matches logged_items/saved_meal_items.quantity_unit (src/server/db/schema.ts).
const QuantityUnit = Schema.Literal("g", "ml", "serving");

// A field the model may legitimately omit — not every label prints a brand
// or a serving size. Value and tag live in one optional struct rather than
// as two independently-optional sibling fields, so the contract's "every
// field carries provenance" rule survives optionality: a present value
// always arrives with its tag, and a tag can never arrive detached from the
// value it describes. Review UI reads `.confidence` off the same object it
// reads `.value` from, with no cross-field correlation to get wrong.
const OptionalWithConfidence = <A, I>(value: Schema.Schema<A, I>) =>
  Schema.optional(Schema.Struct({ value, confidence: ConfidenceLevel }));

// Stage 2, description path: one guessed ingredient out of a free-text
// description ("chicken and rice"). Confidence is per estimated field, not
// per ingredient as a whole — a model can be sure of "chicken" but unsure
// whether "a bowl of" means 150g or 300g.
export class ParsedIngredient extends Schema.Class<ParsedIngredient>(
  "ParsedIngredient",
)({
  name: Schema.String,
  nameConfidence: ConfidenceLevel,
  quantity: Schema.Positive,
  quantityUnit: QuantityUnit,
  quantityConfidence: ConfidenceLevel,
}) {}

// Stage 2, description path (ADR 0001). A multi-ingredient description
// fans out to several ingredients, mirroring logged_items being one row
// per ingredient rather than an ingredients array on a single row.
export class ParsedDescription extends Schema.Class<ParsedDescription>(
  "ParsedDescription",
)({
  ingredients: Schema.NonEmptyArray(ParsedIngredient),
}) {}

// Stage 2, label path: one nutrient value read off a printed label panel.
// Matches nutrient_values' (code, value, unit) shape (src/server/db/schema.ts)
// so Stage 3 label-extraction NutritionFacts carry these straight through
// (ADR 0001: "the printed panel already is the fact").
export class ExtractedNutrient extends Schema.Class<ExtractedNutrient>(
  "ExtractedNutrient",
)({
  code: Schema.String,
  value: Schema.Number,
  unit: Schema.String,
  confidence: ConfidenceLevel,
}) {}

// Stage 2, label path (ADR 0001). Confidence here is extraction confidence
// (was the photo read correctly), not estimation confidence — the distinct
// meaning ADR 0001 draws between the two Stage 2 schemas, even though both
// use the same enum and drive the same "check this is correct" UI nudge.
export class ParsedLabelReading extends Schema.Class<ParsedLabelReading>(
  "ParsedLabelReading",
)({
  foodName: Schema.String,
  foodNameConfidence: ConfidenceLevel,
  brand: OptionalWithConfidence(Schema.String),
  basisUnit: Schema.Literal("g", "ml"),
  servingSize: OptionalWithConfidence(Schema.Positive),
  nutrients: Schema.NonEmptyArray(ExtractedNutrient),
}) {}

// Stage 2, description path's total-database-gap fallback (issue #44): when
// resolveFood finds nothing for a parsed ingredient, the model estimates the
// macros directly instead of the app silently guessing zero. Always the
// whole-ingredient-quantity amount (not per-100g/100ml — that normalization
// happens where this is written into the foods table, see
// src/server/log-description). Not per-field-confidence like ParsedIngredient
// — a total database gap is a single needs_review flag on the ingredient as a
// whole (ADR 0001), not a per-macro judgement.
export class EstimatedNutrition extends Schema.Class<EstimatedNutrition>(
  "EstimatedNutrition",
)({
  energyKcal: Schema.NonNegative,
  proteinG: Schema.NonNegative,
  carbohydrateG: Schema.NonNegative,
  fatG: Schema.NonNegative,
}) {}

// Stage 3 (ADR 0001): the trusted, per-nutrient fact a diary entry is
// actually built from. Shape matches the nutrient_values table exactly —
// `source`/`confidence` are this schema's view of that table's
// `provenance`/`confidence` columns (src/server/db/schema.ts) — since a
// validated NutritionFact is what a write to that table is built from.
// `needs_review` propagates from Stage 2 rather than being re-derived;
// `source: "user_corrected"` is a new record kept alongside the original,
// never an edit to it.
export class NutritionFact extends Schema.Class<NutritionFact>(
  "NutritionFact",
)({
  code: Schema.String,
  value: Schema.Number,
  unit: Schema.String,
  source: Schema.Literal(
    "database",
    "llm_estimate_fallback",
    "label_extraction",
    "user_corrected",
  ),
  confidence: Schema.optional(ConfidenceLevel),
}) {}
