# Intake

A calorie and nutrition tracking PWA with AI-assisted logging. Describe a meal in plain English or photograph the nutrition label; Intake turns either into structured, database-backed nutrition data.

## How it works

The model interprets; the database answers. An LLM parses free text into ingredients and quantities, or extracts fields from a label photo, always into schema-validated structures. Nutrition values come from Open Food Facts and USDA lookups, or from the label itself. The model never invents a calorie count.

```
description ─┐
             ├─ LLM parse (AI SDK + OpenRouter, generateObject)
label photo ─┘        │
                      ▼
        schema validation (zod) ── fail → retry with feedback
                      │
                      ▼
        nutrition lookup (OFF / USDA) or label values
                      │
                      ▼
        user confirms or corrects ──→ corrections join the eval set
                      │
                      ▼
                 saved meal
```

Every correction a user makes becomes a labelled example in the eval dataset, so daily use grows the test suite.

## Features

- Daily calorie goal with dashboard tracking (calories vs goal, macro split, streak)
- Log by description or by nutrition-label photo, with one-tap correction before saving
- Saved meals, searchable, one-tap re-log
- Nutrient insights: macro and micronutrient breakdown, more-of / less-of view
- Installable PWA with camera capture; recent data cached for offline reading

## Evals

Prompt and model changes run against a versioned dataset in CI: [n] label photos with ground truth from Open Food Facts (hand-verified gold tier of [n]) and [n] real meal descriptions with expected parses. Accuracy below threshold fails the build.

| Model | Label extraction (gold tier) | Description parsing | p50 latency | Cost / log |
|---|---|---|---|---|
| [model a] | [x]% | [x]% | [x]s | $[x] |
| [model b] | [x]% | [x]% | [x]s | $[x] |

Chosen models and reasoning: [ADR-003](link). Re-run the comparison with `pnpm evals:compare`.

## Engineering

The parsing, validation, lookup and persistence pipeline is written in Effect: typed errors, retries with backoff, each stage unit-tested in isolation. Playwright covers the three critical journeys. Every model call is traced (tokens, latency, cost, outcome) and the cost-per-log chart lives in the product dashboard. GitHub Actions runs typecheck, lint, units and evals on every PR; branch protection keeps red out of main; Alchemy defines the infrastructure with a preview deployment per PR. Decisions worth defending are recorded as ADRs in [/docs/decisions](link).

## Stack

Next.js (App Router) · TypeScript · Effect · tRPC · TanStack Query · Tailwind · shadcn/ui · Motion · Recharts · Postgres · Vercel AI SDK · OpenRouter · Alchemy · Playwright · GitHub Actions

## Running locally

```bash
git clone [repo]
cd intake
pnpm install
cp .env.example .env   # needs an OpenRouter key and a Postgres URL
pnpm db:migrate && pnpm db:seed
pnpm dev
```

`pnpm test` runs units, `pnpm evals` runs the eval suite, `pnpm e2e` runs Playwright.

## Data and attribution

Product data and label images from [Open Food Facts](https://openfoodfacts.org) (ODbL / CC-BY-SA) and [USDA FoodData Central](https://fdc.nal.usda.gov). In-app corrections stay local to the eval dataset and contain no personal data.

