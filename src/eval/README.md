# Eval harness

Fixture-driven accuracy scoring for both AI pipelines (description parsing,
label-photo reading), gating CI. See [ADR 0001](../../docs/adr/0001-shared-llm-output-contract.md)
for the Stage 2 schemas this scores against, and [ADR 0005](../../docs/adr/0005-model-selection.md)
for why this harness exists (it's the scoring rubric the model-selection
bake-off, issue #54, reuses unmodified).

## Running it

```sh
pnpm eval                    # score both pipelines against the committed cache — what CI runs
pnpm eval --pipeline=label   # just one pipeline
```

No `OPENROUTER_API_KEY` needed for the above — every fixture already has a
cached model response committed at `test/fixtures/eval/cache/`, and the
default run never calls a model.

To update the cache (a new fixture, or a real model-selection change):

```sh
pnpm eval --refresh --model=<openrouter-id> --fallback-model=<openrouter-id>
```

This calls the real models (needs a provisioned `OPENROUTER_API_KEY`) and
overwrites the cache files for whichever pipeline(s) you ran. Commit the
resulting diff — that diff *is* the record of what changed.

## Fixtures

`test/fixtures/eval/description/*.json` and `.../label/*.json`, one file per
fixture — git-versioned, reviewed like code. A label fixture's `imageFile`
points at a sibling photo in the same directory.

- **Label ground truth**: sourced from Open Food Facts, spot-checked against
  the real pack rather than fully re-verified — `groundTruthSource` records
  where it came from, `groundTruthReviewed` whether a human spot-checked it.
- **Description ground truth**: LLM-generated, human-reviewed.

Tolerances (see `src/eval/scoring.ts`): label reads ±2%, description parses
±15% — the label already is the fact, so its bar for "close enough" is
tighter than an estimate parsed from free text.

**Seed dataset only.** This ships with three placeholder fixtures (two
description, one label) to prove the harness end to end — enough to gate CI
today, not enough to trust the accuracy numbers themselves yet. The label
fixture's photo (`weetabix-original.png`) is a synthetic placeholder, not a
real nutrition-label photo — growing this into a real, representative
dataset (real label photos included) is tracked as a fast-follow.

## Scoring

Per item: every expected field must match within tolerance to pass — see
`scoreDescriptionItem`/`scoreLabelItem` in `src/eval/scoring.ts` for the
exact rules (name matching is case/whitespace-insensitive; a label's
foodName also tolerates the brand folded in). Aggregated to `% passing`,
gated against the brief's floor (label ≥95%, description ≥85% —
`LABEL_ACCURACY_FLOOR`/`DESCRIPTION_ACCURACY_FLOOR`).

A model's own `needs_review` confidence tags are counted and reported
(`itemsNeedingReview`) but never affect pass/fail — confidence is a
correctness claim about a value, not a substitute for checking the value
itself.

## Corrections queue

```sh
pnpm eval:corrections-queue
```

Lists every real user correction (`logged_items.corrected_from_id`) for
periodic manual review — a human decides whether a correction is worth
turning into a new or updated fixture. This never writes to
`test/fixtures/eval` itself; there's no automatic dataset promotion.
