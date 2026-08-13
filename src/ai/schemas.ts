import { Schema } from "effect";
import { NUTRIENT_CODES, NUTRIENT_UNITS } from "../server/food/nutrient-codes";

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
export const QuantityUnit = Schema.Literal("g", "ml", "serving");
export type QuantityUnit = typeof QuantityUnit.Type;

// A field the model may legitimately omit — not every label prints a brand
// or a serving size. Value and tag live in one optional struct rather than
// as two independently-optional sibling fields, so the contract's "every
// field carries provenance" rule survives optionality: a present value
// always arrives with its tag, and a tag can never arrive detached from the
// value it describes. Review UI reads `.confidence` off the same object it
// reads `.value` from, with no cross-field correlation to get wrong.
const OptionalWithConfidence = <A, I>(value: Schema.Schema<A, I>) =>
  Schema.optional(Schema.Struct({ value, confidence: ConfidenceLevel }));

// Issue #50's clarify-up-front chip: offered only when an ingredient's
// identity is genuinely ambiguous in a way that would change its nutrition
// ("a latte" — which milk?). `label` is the chip's button text; `searchTerm`
// is what Stage 3 searches the food database with if the user picks it —
// kept separate from `label` since a natural chip label ("Oat milk") isn't
// always the best search string on its own (resolve-ingredient.ts folds it
// into the ingredient's own name before searching).
export class ClarifyOption extends Schema.Class<ClarifyOption>(
  "ClarifyOption",
)({
  label: Schema.String,
  searchTerm: Schema.String,
}) {}

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
  // Present only for a genuinely ambiguous identity — most ingredients have
  // none. When present, nameConfidence must be "needs_review": the model
  // itself is saying it can't pick one, which is exactly what needs_review
  // means (enforced by ParsedDescription's per-ingredient filter below).
  clarifyOptions: Schema.optional(Schema.NonEmptyArray(ClarifyOption)),
}) {}

// Issue #50: the client round-trips the exact ParsedIngredient array a
// `parse` call returned back to `confirm`, each optionally carrying the
// clarify-chip answer (a ClarifyOption's searchTerm, or free text from
// "Something else…") the user gave for it. A plain extension rather than a
// new field on ParsedIngredient itself — Stage 2 never produces this field,
// only the client does, so keeping it a separate type keeps "what the model
// said" and "what the user answered" from blurring into one shape.
export class ClarifiedIngredient extends Schema.Class<ClarifiedIngredient>(
  "ClarifiedIngredient",
)({
  ...ParsedIngredient.fields,
  clarificationSearchTerm: Schema.optional(Schema.String),
}) {}

// Stage 2, description path (ADR 0001). A multi-ingredient description
// fans out to several ingredients, mirroring logged_items being one row
// per ingredient rather than an ingredients array on a single row.
export class ParsedDescription extends Schema.Class<ParsedDescription>(
  "ParsedDescription",
)({
  ingredients: Schema.NonEmptyArray(ParsedIngredient).pipe(
    // clarifyOptions is the model itself saying "I can't pick one" — the
    // same needs_review meaning nameConfidence already carries, so the two
    // must agree rather than letting a "confident" ingredient also carry
    // unresolved chip options.
    Schema.filter((ingredients) => {
      const mismatch = ingredients.find(
        (ingredient) =>
          ingredient.clarifyOptions && ingredient.nameConfidence !== "needs_review",
      );
      return mismatch
        ? `"${mismatch.name}" offers clarifyOptions but its nameConfidence is "confident" — clarifyOptions requires "needs_review"`
        : true;
    }),
  ),
}) {}

// Stage 2, label path: one nutrient value read off a printed label panel.
// Matches nutrient_values' (code, value, unit) shape (src/server/db/schema.ts)
// so Stage 3 label-extraction NutritionFacts carry these straight through
// (ADR 0001: "the printed panel already is the fact").
//
// `code` is the app's fixed nutrient vocabulary (nutrient-codes.ts), the same
// list the OCR prompt constrains the model to — a pure constants module, so
// this validates against one vocabulary rather than restating it. `value` is
// non-negative: no printed panel carries a negative amount.
export class ExtractedNutrient extends Schema.Class<ExtractedNutrient>(
  "ExtractedNutrient",
)({
  code: Schema.Literal(...Object.values(NUTRIENT_CODES)),
  value: Schema.NonNegative,
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
  // Same "at least one" guarantee as Schema.NonEmptyArray, but typed as a
  // plain ReadonlyArray rather than a `[X, ...X[]]` tuple: the label-save
  // router (issue #47) round-trips this exact shape from the client, whose
  // tRPC-inferred copy of it (lib/router-types.ts) isn't tuple-typed — a
  // tuple type here would make that legitimate round-trip a type error.
  nutrients: Schema.Array(ExtractedNutrient).pipe(
    Schema.minItems(1),
    // Two cross-nutrient rules the per-item schema can't state. One entry per
    // code: nutrient_values is uniquely indexed on (food_id, code), so a
    // duplicate would abort the confirmed save at the database instead of
    // here. And each code's unit is fixed (nutrient-codes.ts) — "salt in
    // kcal" must not reach the totals the confirm screen adds up.
    Schema.filter((nutrients) => {
      const codes = new Set(nutrients.map((nutrient) => nutrient.code));
      if (codes.size !== nutrients.length) {
        return "a label panel prints each nutrient once — duplicate code";
      }
      const mismatch = nutrients.find(
        (nutrient) => nutrient.unit !== NUTRIENT_UNITS[nutrient.code],
      );
      return mismatch
        ? `${mismatch.code} is measured in ${NUTRIENT_UNITS[mismatch.code]}, not ${mismatch.unit}`
        : true;
    }),
  ),
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
