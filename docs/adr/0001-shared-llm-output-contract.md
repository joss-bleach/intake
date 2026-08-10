# Shared LLM-output contract: three-stage validation, split by pipeline

**Status:** accepted

**Context:** Both AI logging paths (description parsing, label-photo OCR) must never let raw model output be trusted as nutrition fact directly — the brief's stated principle is "the model interprets, the database answers."

**Decision:** The contract is a three-stage pipeline: raw model response → Effect-Schema-validated Stage 2 intermediate → trusted Stage 3 `NutritionFact`. Stage 2 is **pipeline-specific**, not one shared shape — `ParsedDescription` for the description path's ingredient/quantity guesses, `ParsedLabelReading` for the label path's OCR nutrient extraction — because one pipeline estimates and the other transcribes an already-printed fact. What *is* shared is the pattern: every field carries a per-field provenance tag using a `"confident" | "needs_review"` enum, not a numeric score. The description path's tag is **estimation confidence** (how sure we are about a guessed ingredient/quantity); the label path's is **extraction confidence** (how sure we are the photo was read correctly). Both drive the same generic user-facing nudge — "check this is correct" — the distinction matters internally, not in copy.

Malformed/unparseable model output is a hard Effect failure (`ParseFailure`), retried once via `Schedule` against a designated stronger fallback model (policy only — the actual model choice is deferred to Model selection methodology, [issue #7](https://github.com/joss-bleach/intake/issues/7)). Valid-but-uncertain output is *not* a failure — it's a Stage 2 success carrying `needs_review`. If confidence still doesn't clear after the retry, the app does not block the save: it persists the value flagged `needs_review` and shows the "check this is correct" prompt. A `ParseFailure` value is never silently accepted.

At Stage 3: description-path items resolve against the food-database strategy ([issue #14](https://github.com/joss-bleach/intake/issues/14) — OFF/CoFID/LLM-fallback) and each nutrient value keeps `source: "database" | "llm_estimate_fallback"`. Label-path items skip the database entirely and carry `source: "label_extraction"` straight through — the printed panel already *is* the fact; the model's job there is accurate transcription, not estimation. `needs_review` propagates to Stage 3 regardless of path. A user correction is just a new Stage 3 record with `source: "user_corrected"`, kept alongside the original for the audit trail that feeds the eval dataset — not a separate structure.

## Considered options

- **One shared Stage 2 schema across both pipelines** — rejected: forces meaningless padding fields onto whichever pipeline doesn't naturally produce them (e.g. "ingredients" on a label reading, or "serving size" on an ingredient guess).
- **Numeric confidence score (0–1)** — rejected for now: the UI decision is binary (show the review nudge or don't), and there's no settled method yet for deriving a trustworthy score from an LLM/OCR call. A made-up threshold would just hide an unresolved problem behind a constant.

## Consequences

- Two Stage 2 schemas to maintain instead of one, but each stays honest to what its pipeline actually produces.
- The confidence *enum* is settled; the mechanism used to populate it (self-reported model confidence, logprobs, multi-sample consistency, etc.) is not — spun off as its own research ticket rather than blocking this ADR.
