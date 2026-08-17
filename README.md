# Intake

Intake is a calorie and nutrition tracking PWA. Describe a meal in plain English, or photograph a nutrition label. Intake turns either input into structured, database-backed nutrition data.

I built it before my wedding. I wanted one health app for activity, trending weight, and calories. The calorie apps I tried were too complicated, so calorie tracking was the place to start. I use Intake every day.

Today it logs meals by description or label photo, and shows daily totals, a streak, trends, saved meals, and macro goals. The food database comes from Open Food Facts and UK CoFID.

![Intake dashboard screenshot](docs/screenshots/dashboard.png)

Live demo: https://intake.jossbleach.co.uk

## Key features

- **Free-text meal logging.** You type "chicken sandwich with mayo". The model interprets the sentence, and the food database answers the nutrition. Each ingredient becomes its own row, so you can correct one item without touching the rest ([ADR 0001](docs/adr/0001-shared-llm-output-contract.md)).
- **Label-photo logging.** A photo of a nutrition panel goes through a vision model that transcribes the printed values. This path skips the food database, because the printed panel is already the nutrition fact ([`src/ai/`](src/ai/)).
- **Model output is untrusted input.** Three stages: raw response, then an Effect-Schema-validated intermediate, then a trusted `NutritionFact`. Output that cannot be decoded is an Effect failure and retries once against a stronger model. Output that decodes but reads as uncertain is a success flagged `needs_review`, and Intake still saves the value.
- **Per-field confidence and provenance.** Every nutrient value records where it came from: `database`, `llm_estimate_fallback`, `label_extraction`, or `user_corrected`. A correction inserts a new row that points at the original, so the audit trail stays intact and feeds the eval dataset.
- **Evals gate CI.** A fixture-driven harness ([`src/eval/`](src/eval/README.md)) scores both pipelines against tolerance bands and accuracy floors. CI replays committed cached model responses, so the gate needs no API key and cache diffs show what changed.

## Tech stack

- **Client**: React 19 · TypeScript · Vite · Tailwind · shadcn/ui · TanStack Query
- **API**: tRPC · Effect · Vercel AI SDK via OpenRouter
- **Data**: Postgres · Drizzle · Neon
- **Platform**: Cloudflare Workers · Hyperdrive · Alchemy for infrastructure
- **Quality**: Vitest · Playwright · GitHub Actions · Sentry · GlitchTip for local development

## Setup

You need Node 22 or later, [pnpm](https://pnpm.io), and Docker.

```sh
git clone https://github.com/joss-bleach/intake.git
cd intake
pnpm install

cp .env.example .env.local
openssl rand -base64 32   # paste the output into BETTER_AUTH_SECRET= in .env.local

pnpm db:up
until docker compose exec -T postgres pg_isready -U intake; do sleep 1; done
pnpm db:migrate   # apply the Drizzle migrations
pnpm dev          # client on :5173, server on :3001
```

The dev server and `pnpm db:migrate` read `.env.local`, so copy the example file to that name. `BETTER_AUTH_SECRET` has no default and must be at least 32 characters. The server refuses to boot without it.

`OPENROUTER_API_KEY` is optional. Without it the app runs, and only the AI logging paths fail.

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm eval`.

## Technical decisions

**I chose a two-value confidence enum over a numeric 0 to 1 score, because the UI decision is binary.** The app either shows the "check this is correct" prompt or it does not. No settled method exists to derive a trustworthy score from a model call, so a threshold constant would hide an unsolved problem ([ADR 0001](docs/adr/0001-shared-llm-output-contract.md)).

**I chose the Vercel AI SDK over `@effect/ai`, because `@effect/ai` is alpha.** `@effect/ai` was the better architectural match, with native Effect Schema and Layer composition. It also labels itself experimental and was mid-migration to an unreleased Effect v4. One module, [`src/ai/effect-ai-sdk.ts`](src/ai/effect-ai-sdk.ts), wraps the SDK and tags its errors. Nothing else imports `ai` ([ADR 0004](docs/adr/0004-vercel-ai-sdk-vendor.md)).

**I chose `pg` with Hyperdrive over the Neon serverless driver, because the serverless driver needs a per-request connection.** Its WebSocket pool must open and close inside one request, which conflicts with the module-level `db` singleton used by every router and about 17 test files. Hyperdrive runs the standard `pg` driver over `cloudflare:sockets`, so the same driver works in tests, local development, and production ([ADR 0008](docs/adr/0008-cloudflare-worker-deploy.md)).

## Challenges I solved

**Effect Schema did not reach the model.** ADR 0004 assumed `Schema.standardSchemaV1` would plug straight into `generateObject`. Effect's Standard Schema output carries no `~standard.jsonSchema` converter, so every live call failed before the network. I found this during the model bake-off, when the first real call ran. The fix builds the schema with `JSONSchema.make` and decodes with `Schema.decodeUnknownEither` in `toGenerateObjectSchema`. `test/unit/ai/effect-ai-sdk.test.ts` covers the conversion, and `test/integration/ai-sdk.test.ts` runs a live round-trip when `OPENROUTER_API_KEY` is set.

**The eval fixtures could not gate the model bake-off.** The one label fixture was a synthetic image, and the description fixtures used the harness's deliberately plain prompt, so no candidate cleared the accuracy floors. That result showed a weakness in the seed data rather than a limit in the models. I ran the vision candidates against a real UK label photo instead, kept the text results from the harness, and recorded both deviations and the fast-follows in [ADR 0005](docs/adr/0005-model-selection.md).

**Cloudflare rejected the Worker upload.** Reading Hyperdrive's connection string at module scope fails validation with error 10021. The Worker now reads it inside each handler and scopes a per-request pool through `createDb`/`withDb`. A `pnpm infra:validate` step bundles and boots the Worker in workerd during CI, so the same class of failure stops at the pull request instead of the deploy.

**Open Food Facts ingestion does not fit in a Worker.** The dump is several gigabytes and streams from disk. A Worker has no filesystem. That job runs as a scheduled GitHub Actions workflow against Neon directly, and upserts on `(provenance, external_id)` so a re-run is safe. The daily spend tripwire stays a Worker cron.

## What I would improve next

- **Weight tracking.** Daily weigh-ins next to the food log, shown as a smoothed trend to remove scale noise.
- **Insights and correlations.** Link eating patterns to weight change. Insights follow the same honesty rules as logging, and state confidence instead of implying cause.
- **Stronger eval fixtures.** Replace the synthetic label image with a real, licensed photo, and re-run the vision bake-off. Re-run the text bake-off against the production prompt, because the ranking may change.
- **A confidence signal with a real source.** The enum is settled, but the code populates it from model self-report. See [`docs/research/confidence-signal-derivation.md`](docs/research/confidence-signal-derivation.md).

More documentation: [`docs/adr/`](docs/adr/) for architecture decisions, [`docs/research/`](docs/research/) for model candidates, [`CONTEXT.md`](CONTEXT.md) for domain vocabulary.
