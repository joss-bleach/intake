# Intake

A calorie and nutrition tracking PWA I use every day. Describe a meal in plain English or photograph the nutrition label; Intake turns either into structured, database-backed nutrition data.

The engineering around the AI is the interesting part. Intake treats model output as untrusted input, measures accuracy with an eval harness that gates CI, and picked its models in a documented bake-off. Start with the two flagship ADRs: [the LLM output contract](docs/adr/0001-shared-llm-output-contract.md) and [model selection](docs/adr/0005-model-selection.md).

## The AI engineering

- **A three-stage output contract.** Raw response → Effect-Schema-validated intermediate → trusted `NutritionFact`. The model interprets what you said; the food database answers the nutrition wherever it can ([`src/ai/schemas.ts`](src/ai/schemas.ts), [ADR 0001](docs/adr/0001-shared-llm-output-contract.md)).
- **Per-field confidence with provenance.** Fields carry `"confident" | "needs_review"`; I chose an enum over a numeric score the model would invent. `needs_review` leaves the save alone and drives a "check this" nudge in the UI. Each nutrient value records its source: `database`, `llm_estimate_fallback`, `label_extraction`, or `user_corrected`.
- **Evals gate CI.** A fixture-driven harness ([`src/eval/`](src/eval/README.md)) scores both logging pipelines against tolerance bands and accuracy floors. CI runs it on committed cached model responses, so it needs no API key and cache diffs double as the audit trail.
- **Model selection ran as a bake-off.** [ADR 0005](docs/adr/0005-model-selection.md) records the rubric, the candidates, and the deviations. Winners ship as env defaults, and a re-run waits for a trigger such as a new candidate model or eval drift.
- **One module wraps the vendor SDK** ([`src/ai/effect-ai-sdk.ts`](src/ai/effect-ai-sdk.ts), [ADR 0004](docs/adr/0004-vercel-ai-sdk-vendor.md)), tagging errors so a schema-rejected response retries against a stronger fallback model while auth and rate-limit failures fail fast. Each call lands in a `model_calls` table with correlation IDs, and a row-count tripwire alerts on runaway spend.
- **Corrections stay auditable.** A correction inserts a new row pointing at the original instead of overwriting it. A queue surfaces real corrections for promotion into eval fixtures; a human reviews each one by design.
- **Ambiguity is a product surface.** "A latte" gets clarify chips ("which milk?") when the answer changes the nutrition, and offering chips forces `needs_review` at the schema level.

## Today

Log meals by free-text description (with clarify chips and corrections) or nutrition-label photo (with an incomplete-read handoff). Food database from Open Food Facts and UK CoFID ingestion. Dashboard with daily totals, streak, and trends. Saved meals and macro goals.

## Roadmap

1. **Weight tracking.** Fast daily weigh-ins alongside the food log, displayed as a smoothed trend to filter out day-to-day scale noise.
2. **Insights and correlations.** Connect eating habits to weight change: which logged foods and patterns coincide with the biggest movements. Insights follow the same honesty rules as the logging pipeline and state their confidence instead of implying causation.

## Stack

React 19 · TypeScript · Vite · Tailwind · shadcn/ui · tRPC · TanStack Query · Effect · Vercel AI SDK (via OpenRouter) · Postgres + Drizzle · GlitchTip · Alchemy (IaC) · Vitest · Playwright · GitHub Actions

## Development

Requires Node 22+ and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm db:up      # local Postgres (docker compose)
pnpm dev        # client on :5173, tRPC server on :3001
```

`pnpm test`, `pnpm test:e2e`, `pnpm eval`, and `pnpm lint` cover the checks; see `package.json` for the rest. Copy `.env.example` to `.env`; AI-powered logging needs `OPENROUTER_API_KEY`, everything else runs without it.

More docs: [`docs/adr/`](docs/adr/) (architecture decisions), [`docs/research/`](docs/research/) (model candidates, confidence-signal derivation), [`CONTEXT.md`](CONTEXT.md) (domain vocabulary).
