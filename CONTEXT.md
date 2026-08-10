# Intake

A calorie and nutrition tracking PWA with AI-assisted logging, via two entry paths: description parsing and label-photo reading.

## Language

**NutritionFact**:
The trusted, Stage-3 nutrition record backing a logged item — the only nutrition data ever saved as fact. Reached only after Effect-Schema validation and, for the description path, food-database resolution.
_Avoid_: raw model output, parsed result (neither is trusted yet)

**ParsedDescription**:
The Stage-2 validated intermediate produced by the description-parsing pipeline: guessed ingredients and quantities, not yet resolved against the food database.

**ParsedLabelReading**:
The Stage-2 validated intermediate produced by the label-photo pipeline: nutrient values transcribed from a photographed label. Not an estimate — the label already is the fact; this pipeline's job is accurate transcription.

**Estimation confidence**:
Per-field confidence tag on `ParsedDescription` fields, marking how sure the pipeline is about a guessed ingredient or quantity. See ADR 0001.

**Extraction confidence**:
Per-field confidence tag on `ParsedLabelReading` fields, marking how sure the pipeline is that a printed nutrient value was read correctly from the photo. See ADR 0001.

**needs_review**:
The confidence-enum value (alongside `confident`) shared by estimation confidence and extraction confidence, marking a field the user should check before it's trusted. Drives the generic "check this is correct" prompt regardless of which kind of confidence flagged it.
_Avoid_: confidence score, numeric confidence (deliberately not used — see ADR 0001)

**Provenance** (`source`):
Tag on a `NutritionFact` field recording where the value came from: `"database"`, `"llm_estimate_fallback"`, `"label_extraction"`, or `"user_corrected"`.

**ParseFailure**:
An Effect failure (not a success value) representing model output that couldn't even be decoded — missing fields, broken JSON. Distinct from `needs_review`, which is a valid, decodable, but low-confidence success.
