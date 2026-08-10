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

**Food**:
A reusable, searchable nutrition record, normalized to per-100g/100ml, backing zero or more `LoggedItem`s. Source-agnostic — a `Food` may come from the OFF cache, CoFID, an `llm_estimate_fallback`, or a verified `label_extraction`; all four live in the same table, distinguished only by their provenance tag. Editing a `Food` directly (e.g. fixing a bad saved value) updates it for every future log — this is the "correct the product" flow, distinct from correcting one `LoggedItem`.
_Avoid_: product, item (ambiguous with `LoggedItem`)

**NutrientValue**:
One nutrient amount (code, value, unit) attached to either a `Food` or a `LoggedItem`, stored in a narrow value table rather than fixed columns — CoFID alone carries ~150–185 nutrient fields, most NULL for any given OFF or label-extracted `Food`. Carries its own provenance/confidence per ADR 0001, since confidence is per-field, not per-record.

**DiaryEntry**:
The parent record of one logging action — a timestamp and entry method (description or label-photo) grouping one or more `LoggedItem`s. A multi-ingredient description ("chicken sandwich with mayo") produces one `DiaryEntry` with several `LoggedItem` children, not one row with an ingredients array — keeps each ingredient individually correctable.

**LoggedItem**:
One resolved `Food` + quantity saved under a `DiaryEntry`. A correction to *this specific log* (e.g. wrong quantity typed) is a new `LoggedItem` row with `corrected_from_id` pointing at the original, which is kept unmodified for audit and the eval correction-feedback loop (see #6) — never a separate `corrections` table. This is instance-level correction; it's distinct from editing the underlying `Food`, which corrects the product itself for all future logs.

**SavedMeal**:
A named, reusable bundle of `Food` + quantity pairs (`SavedMealItem`s) a user can re-log in one action — e.g. a sandwich built from several separately-scanned label reads. Tracks `times_logged`/`last_logged_at` for frequency ranking. A single, un-bundled food re-logged from history ("recently had Weetabix") is *not* a `SavedMeal` — it's just a query over `LoggedItem` grouped by `Food`; `SavedMeal` is reserved for deliberately named multi-item bundles.
