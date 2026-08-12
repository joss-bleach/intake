# Model selection methodology

**Status:** accepted

**Context:** Three model roles need picking — vision primary (label-photo OCR, cheap/fast tier), vision fallback (the ADR 0001 retry-on-`ParseFailure` model, cost-agnostic), and text/description parsing (single model, no fallback tier — its own retry re-tries itself). Full rubric discussion: [Model selection methodology](https://github.com/joss-bleach/intake/issues/7). Candidate research: [vision-model-candidates](https://github.com/joss-bleach/intake/tree/research/vision-model-candidates/docs/research/vision-model-candidates.md) (issue #23), [text-model-candidates](https://github.com/joss-bleach/intake/tree/research/text-model-candidates/docs/research/text-model-candidates.md) (issue #24). Scoring itself needs the eval harness ([Eval harness + dataset design](https://github.com/joss-bleach/intake/issues/6)) to exist and a provisioned `OPENROUTER_API_KEY`, neither of which exist yet — [Run model-selection bake-off](https://github.com/joss-bleach/intake/issues/25) confirmed this is real build-phase work, not a cheap task, and was closed out of scope for the architecture-spec map. This ADR therefore records the decided *methodology* — rubric, candidate shortlists, process — with the actual picks marked TBD, to run for real once the harness exists.

**Decision:**

**Scoring rubric.** Gate on the brief's accuracy floor first — label reads ≥95/100, description parses ≥85/100 — scored by the same eval harness from #6, reused unmodified against each candidate model. Among candidates clearing the floor:

- **Vision primary** and **text parsing**: pick cheapest, latency as tiebreaker.
- **Vision fallback**: pick highest accuracy alone, cost and latency ignored — it's the rarely-used retry path, so clearing the failures the primary couldn't matters more than its price.

**Candidate pool.** Not hand-curated — sourced via two dedicated research tickets, one per model type, each pulling current vision-capable / text-capable OpenRouter models with pricing and any available benchmark signal.

**Vision candidates ([#23](https://github.com/joss-bleach/intake/issues/23)):**

*Primary tier (cheap-fast):* `google/gemini-2.5-flash-lite`, `qwen/qwen3-vl-30b-a3b-instruct` (or `qwen3-vl-8b-instruct`), `openai/gpt-4o-mini`, `mistralai/mistral-small-3.2-24b-instruct`.

*Fallback tier (cost-agnostic):* `google/gemini-2.5-pro`, `openai/gpt-5`, `anthropic/claude-opus-5` / `anthropic/claude-sonnet-5`, `qwen/qwen3-vl-235b-a22b-instruct`.

**Text candidates ([#24](https://github.com/joss-bleach/intake/issues/24)):** `qwen/qwen3-30b-a3b-instruct-2507`, `openai/gpt-4.1-nano`, `google/gemini-2.5-flash-lite`, `openai/gpt-4o-mini`, `deepseek/deepseek-chat-v3.1`, `anthropic/claude-haiku-4.5` — spanning roughly a 100x price range.

Both research tickets flag some cited benchmark numbers as sourced from secondary coverage or not independently re-extracted this session ("re-pull before load-bearing") — the bake-off run should re-verify anything load-bearing rather than trust the citation as-is.

**Cadence.** One-time bake-off at MVP launch; re-run only on a trigger (a candidate model is deprecated, its pricing shifts, or a notable new entrant appears) — no fixed re-run schedule.

**Actual picks:**

| Role | Model | Notes |
|---|---|---|
| Vision primary | **TBD** | Pending real bake-off — build phase, once #6's harness is implemented and an OpenRouter key is provisioned. |
| Vision fallback | **TBD** | Same run as primary, highest-accuracy pick. |
| Text/description parsing | **TBD** | Same run, cheapest-with-latency-tiebreaker pick. |

## Considered options

- **Hand-curate the candidate shortlists** — rejected: risks missing cheaper or better-benchmarked entrants on a fast-moving model marketplace; dedicated research tickets keep sourcing current and repeatable for the eventual re-run.
- **Uniform cheapest-wins rule across all three roles** — rejected for the fallback tier: a cost-agnostic, highest-accuracy pick is the point of having a fallback tier at all — a fallback picked on price would just be a second primary.
- **Run the bake-off now, inside this map** — rejected: it needs an eval-harness implementation and a provisioned OpenRouter key, neither of which exist in this spec-only repo; ruled out of scope by [#25](https://github.com/joss-bleach/intake/issues/25) rather than stretched into a "cheap task ticket."
- **Fixed re-run schedule (e.g. quarterly)** — rejected: model pricing and capability shift on vendor timelines, not calendar ones; trigger-based re-runs (deprecation, price change, notable new entrant) avoid both stale picks and needless re-runs.

## Consequences

- The MVP ships with **no chosen models** until the build phase runs this bake-off for real — the eval harness (#6) must exist and an OpenRouter key must be provisioned first; this ADR is not actionable on its own.
- Because scoring reuses #6's harness unmodified, the harness's tolerances (±2% label reads, ±15% description parses) and fixture set are load-bearing for this decision too — any future change to the harness's fixtures or tolerances should prompt reconsidering whether prior bake-off results still hold.
- The vision-fallback pick is deliberately not the vision-primary pick's cheaper sibling — it's optimized for a different objective (accuracy, not cost) from the same run, so the two picks may come from different model families entirely.
- Re-verifying the "re-pull before load-bearing" benchmark citations from #23/#24 is deferred to whoever runs the actual bake-off, not done here.
