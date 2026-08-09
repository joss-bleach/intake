# AI SDK vendor comparison: Vercel AI SDK vs TanStack AI vs @effect/ai

## Question

Issue #10 asks what TanStack AI (Beta) and `@effect/ai` actually offer *today* — maturity,
Effect-ecosystem fit, streaming/tool-call support — compared with the Vercel AI SDK the
project's brief already leans toward. This document is research input for the follow-up
AI-SDK vendor ADR (issue #11). **It does not make the vendor decision.**

Project context this research is filtered through: React (no Next.js), TypeScript, Effect
for pipeline composition, tRPC, TanStack Query, OpenRouter as the model provider, and a plan
to validate LLM output with Effect Schema passed via the Standard Schema interface.

All facts below are sourced from primary sources (npm registry metadata, GitHub repos/READMEs,
official docs sites) fetched on 2026-08-09. Version numbers are dist-tags at that date and will
drift.

---

## 1. Vercel AI SDK (`ai` on npm)

**Maturity.** The `ai` package is mature and has gone through multiple major versions.
Current npm dist-tags (2026-08-09): `latest` = `7.0.58`, with `alpha`/`beta`/`canary` tracks for
the next major, and legacy `ai-v5` (`5.0.228`) / `ai-v6` (`6.0.246`) tags still published for
apps that haven't upgraded. The `vercel/ai` GitHub repo has ~26.1k stars and was created in May
2023 — long history, large community, active maintenance cadence (a new patch shipped the same
day this research was done). [npm: ai](https://www.npmjs.com/package/ai), [GitHub:
vercel/ai](https://github.com/vercel/ai)

**OpenRouter support.** Not a first-party Vercel package, but there is an OpenRouter-maintained
provider: `@openrouter/ai-sdk-provider`, published under the `OpenRouterTeam` GitHub org (i.e.
maintained by OpenRouter itself, not a random community fork), currently at npm `latest` =
`3.0.0` with 420+ dependent projects reported on its npm page, ~672 GitHub stars, not archived.
The current release line targets `ai@^7.0.0`, requires Node 22+, ESM-only. This is a
well-maintained, vendor-backed (OpenRouter-side) integration rather than an official
Vercel-side one — worth noting as a boundary of "official" support, but healthy in practice.
[GitHub: OpenRouterTeam/ai-sdk-provider](https://github.com/OpenRouterTeam/ai-sdk-provider),
[npm: @openrouter/ai-sdk-provider](https://www.npmjs.com/package/@openrouter/ai-sdk-provider),
[OpenRouter docs: Vercel AI SDK integration](https://openrouter.ai/docs/guides/community/vercel-ai-sdk)

**Streaming.** Core, long-standing feature — `streamText`/`streamObject` and related
primitives are the backbone of the SDK's design; this is not in question.

**Tool calling.** Core, long-standing feature (`tool()` definitions, multi-step tool loops,
agent loop helpers) — mature and widely used in production.

**Structured output / schema fit.** The SDK's `generateObject`/`streamObject` and tool
definitions accept Zod schemas natively, and the SDK has adopted the **Standard Schema**
interface, so any Standard-Schema-compliant validator (including Effect Schema, since Effect
Schema implements Standard Schema) can in principle be passed in directly — this lines up with
the project's stated plan to validate LLM output with Effect Schema via Standard Schema.

**Effect-ecosystem fit.** None natively — it is a standalone, provider-agnostic SDK with no
Effect-specific primitives (no `Effect`/`Layer` composition, no Effect Schema-first API). Any
Effect integration is left to the consuming app (e.g., wrapping `streamText` calls in
`Effect.tryPromise`/`Effect.promise`) rather than provided by the library.

---

## 2. TanStack AI (`@tanstack/ai`)

**Maturity — pre-1.0, young, but real and released (not vaporware).** This is a genuine,
shipping SDK, not just an announcement: npm registry shows real published versions starting at
`0.0.1` (first published 2025-12-04) up through the current `latest` = `0.43.1` on
2026-08-09 — i.e. it is roughly 8 months old and has already gone through 40+ minor version
bumps, indicating rapid, still-settling API churn typical of a pre-1.0 package.
The GitHub repo `TanStack/ai` was created 2025-10-08 and has ~2,976 stars and 108 open issues
as of this research — young but clearly getting real usage and community attention (TanStack's
name recognition helps here). The README itself does not use the words "alpha"/"beta"/
"experimental," but the sub-1.0 version numbers and the pace of releases are the more reliable
maturity signal than marketing copy — treat this as **beta-quality, not production-hardened**,
consistent with the issue's framing as "TanStack AI Beta." [npm:
@tanstack/ai](https://www.npmjs.com/package/@tanstack/ai), [GitHub:
TanStack/ai](https://github.com/TanStack/ai), [README](https://github.com/TanStack/ai/blob/main/README.md)

**Provider / OpenRouter support.** The README explicitly documents OpenRouter as "a good
starting point if you want access to many providers through one API key," installed as a
separate `@tanstack/ai-openrouter` adapter package alongside the core `@tanstack/ai` package.
Other adapters exist for OpenAI, Anthropic, Gemini, Ollama, xAI Grok, Groq, and more. This is a
first-party (TanStack-maintained) adapter, not a third-party contribution, which is a positive
signal despite the package's overall youth.

**Streaming.** Explicitly documented and demoed in the README (`chat()` +
`toServerSentEventsResponse()` example); framework-native streaming clients exist for React,
Vue, Svelte, Solid, and Preact plus a headless client.

**Tool calling.** Explicitly supported via a `toolDefinition()` contract that can be shared
between server-run and client-run tool implementations with input/output schemas (Zod shown in
the example, but the README also lists JSON Schema, ArkType, and Valibot as supported schema
sources for structured output/tools) — notably broader schema-library support than a
Zod-only design.

**Structured output / schema fit.** README states structured-output flows are "backed by JSON
Schema, Zod, ArkType, Valibot, or plain JSON Schema" — i.e. multiple schema libraries are
supported through a JSON-Schema-shaped contract rather than Standard Schema specifically. No
explicit mention of Standard Schema or Effect Schema support was found in the README or docs
fetched. This is a gap relative to the project's Effect-Schema-via-Standard-Schema plan —
would need direct verification (e.g. does Effect Schema's JSON Schema/Standard Schema output
work through TanStack AI's `outputSchema` option) before relying on it.

**Effect-ecosystem fit.** No Effect-specific integration found; it is a general
provider-agnostic, multi-framework (React/Vue/Svelte/Solid/Preact) SDK with no ties to the
Effect ecosystem. TanStack AI even publishes its own [comparison doc against the Vercel AI
SDK](https://tanstack.com/ai/latest/docs/comparison/vercel-ai-sdk), worth reading directly if a
head-to-head architecture comparison is needed for the ADR.

---

## 3. `@effect/ai` (official Effect-TS AI integration)

**Maturity — explicitly labeled experimental/alpha by its own docs, and mid-migration to a
new major version.** The official Effect docs state in plain language: *"The Effect AI
integration packages are currently in the experimental / alpha stage."*
[effect.website/docs/ai/introduction](https://effect.website/docs/ai/introduction)
npm shows `@effect/ai` `latest` = `0.37.0` (first published 2024-10-11, 189 published versions
total to date) — a pre-1.0 package with a high release cadence, consistent with the "alpha"
label. Provider packages show the same pattern: `@effect/ai-openai` `latest` = `0.41.0` but also
carries a `beta` dist-tag at `4.0.0-beta.106`; `@effect/ai-openrouter` `latest` = `0.12.0` with a
`beta` dist-tag also at `4.0.0-beta.106`. The jump to a `4.0.0-beta.*` line (vs. the `0.x`
stable line) reflects that Effect-TS is currently developing these AI packages against an
in-progress **Effect v4 beta** — i.e. the whole `@effect/ai-*` family is being actively
reworked alongside a not-yet-stable major version of Effect core itself. This is meaningfully
less mature than either alternative above.

**Provider / OpenRouter support.** There *is* a dedicated `@effect/ai-openrouter` package (not
just an OpenAI-compat shim) confirmed in the `Effect-TS/effect` monorepo at
`packages/ai/openrouter`, alongside `@effect/ai-openai`, `@effect/ai-anthropic`, and
`@effect/ai-openai-compat`. Effect's own docs page for AI, however, lists only OpenAI,
Anthropic, Amazon Bedrock, and Google as providers with direct integrations in its
introduction — OpenRouter isn't mentioned in the docs prose despite the package existing, which
suggests OpenRouter support is newer/less-documented than the core providers. Given
`@effect/ai-openrouter`'s very low version numbers (`0.12.0` stable / `4.0.0-beta.106` beta) it
should be treated as thin/early relative to the OpenAI and Anthropic integrations.
[GitHub: Effect-TS/effect, packages/ai](https://github.com/Effect-TS/effect/tree/main/packages/ai)

**Streaming.** Documented as a core capability, built on Effect's `Stream` primitive (i.e.
streaming responses are modeled as an `Effect.Stream`, not a bespoke async-iterator type),
which is a natural fit for a codebase already composing pipelines with Effect.

**Tool calling.** Supported via a `Toolkit` API: tools are defined with `Tool.make()` using
**Effect Schema** for inputs, outputs (success/failure), and descriptions, then bundled into a
`Toolkit` and provided to the model through Effect's `Layer`/dependency-injection system so
tool handlers can be tested and composed like any other Effect service.
[effect.website/docs/ai/tool-use](https://effect.website/docs/ai/tool-use/)

**Structured output / schema fit — the standout strength.** Because `@effect/ai` is built by
the Effect team, its structured-output and tool-input/output validation is Effect Schema
*natively*, not through a Standard Schema adapter layer — there's no impedance mismatch to
manage. This is the one area where `@effect/ai` is ahead of both alternatives for a project
that has already committed to Effect Schema as its LLM-output validation mechanism.

**Effect-ecosystem fit.** This is the whole point of the package: language models, streaming
responses, and tool handlers are all modeled as ordinary Effects/Layers, so they compose
directly with the rest of an Effect-based pipeline (retries, tracing, concurrency,
dependency injection) without wrapper/adapter code. No other option in this comparison offers
this natively.

---

## Comparison table

| | Vercel AI SDK (`ai`) | TanStack AI (`@tanstack/ai`) | `@effect/ai` |
|---|---|---|---|
| Current version (2026-08-09) | `7.0.58` (`latest`); v6/v5 tags maintained; v8 alpha/beta/canary in progress | `0.43.1` | `0.37.0` (core); provider pkgs `0.12.0`–`0.41.0` stable, `4.0.0-beta.106` beta |
| First released | ~2023 (repo created May 2023) | Dec 2025 (`0.0.1`) | Oct 2024 (`0.1.0`) |
| Official maturity signal | Stable, widely adopted in production | Sub-1.0, ~8 months old, fast-churning; not self-labeled but versioning says beta-quality | Docs self-label "experimental / alpha"; mid-migration to Effect v4 beta |
| GitHub stars (repo) | ~26,100 | ~2,976 | (Effect-TS/effect monorepo) ~15,200 |
| OpenRouter support | Official OpenRouter-maintained provider (`@openrouter/ai-sdk-provider`, v3.0.0, not Vercel-authored) | First-party adapter (`@tanstack/ai-openrouter`), documented in README | Dedicated package exists (`@effect/ai-openrouter`) but very low version / undocumented in main docs — thin |
| Streaming | Mature, core feature | Documented, core feature, multi-framework clients | Modeled via Effect `Stream`, documented core feature |
| Tool calling | Mature, core feature | Documented (`toolDefinition()`, shared server/client contract) | `Toolkit`/`Tool.make()`, Effect Schema-typed, Layer-composed |
| Structured output schema support | Zod native; Standard Schema adopted (Effect Schema usable via Standard Schema) | JSON Schema, Zod, ArkType, Valibot; no explicit Standard Schema/Effect Schema mention found | Effect Schema native (no adapter needed) |
| Effect-ecosystem fit | None (plain promises/async iterators; would need manual `Effect.tryPromise` wrapping) | None found | Native — LMs/streams/tools are Effects/Layers |
| Overall risk flag | Lowest risk technically; OpenRouter support is community/vendor-side, not Vercel's own | Young package, breaking-change risk high pre-1.0, verify Standard-Schema/Effect-Schema compatibility before relying on it | Explicitly alpha by its own docs; currently churning through an Effect-v4-beta rework; OpenRouter integration especially thin |

---

## Tradeoffs relevant to the ADR (not a decision)

- **Vercel AI SDK** is the only option with a long production track record and a stable
  major-version line today. Its OpenRouter support is solid but not Vercel's own — it depends on
  OpenRouter continuing to maintain `@openrouter/ai-sdk-provider`. It has no Effect-native
  ergonomics, so wrapping its promise/stream-based calls to compose with the project's Effect
  pipelines would be on the project to write and maintain, though Standard Schema adoption means
  Effect Schema can likely be passed straight into `generateObject`/tool schemas without a
  translation layer.
- **TanStack AI** is real, shipping, and already has a first-party OpenRouter adapter and
  multi-framework streaming clients, which fits a React app well — but it is very young
  (~8 months old, sub-1.0, high version churn) and its structured-output schema support doesn't
  explicitly mention Standard Schema/Effect Schema, so that compatibility would need to be
  verified directly before counting on it for the project's Effect-Schema-validation plan.
- **`@effect/ai`** is the only option with native Effect Schema and Effect/Layer composition —
  directly matching two of the project's stated architectural commitments (Effect pipelines,
  Effect Schema for LLM-output validation) with no adapter layer. But it is explicitly
  labeled experimental/alpha by its own maintainers, is currently being reworked against an
  in-progress Effect v4 beta, and its OpenRouter-specific package is thinner/less documented
  than its OpenAI/Anthropic integrations — all of which are real adoption risks for a package
  the project would depend on for a core capability.
- None of the three is a clean strict-dominance winner: Vercel AI SDK trades Effect-native fit
  for maturity/stability; `@effect/ai` trades maturity/stability for Effect-native fit;
  TanStack AI sits in between on maturity but its schema-compatibility story with Effect Schema
  is currently unverified rather than confirmed either way.

---

## Sources

- [npm: ai](https://www.npmjs.com/package/ai) / [GitHub: vercel/ai](https://github.com/vercel/ai)
- [GitHub: OpenRouterTeam/ai-sdk-provider](https://github.com/OpenRouterTeam/ai-sdk-provider) / [npm: @openrouter/ai-sdk-provider](https://www.npmjs.com/package/@openrouter/ai-sdk-provider) / [OpenRouter docs: Vercel AI SDK integration](https://openrouter.ai/docs/guides/community/vercel-ai-sdk)
- [npm: @tanstack/ai](https://www.npmjs.com/package/@tanstack/ai) / [GitHub: TanStack/ai](https://github.com/TanStack/ai) / [README](https://github.com/TanStack/ai/blob/main/README.md) / [TanStack AI vs Vercel AI SDK](https://tanstack.com/ai/latest/docs/comparison/vercel-ai-sdk)
- [npm: @effect/ai](https://www.npmjs.com/package/@effect/ai) / [GitHub: Effect-TS/effect, packages/ai](https://github.com/Effect-TS/effect/tree/main/packages/ai) / [effect.website/docs/ai/introduction](https://effect.website/docs/ai/introduction) / [effect.website/docs/ai/tool-use](https://effect.website/docs/ai/tool-use/)
- npm registry metadata (`registry.npmjs.org`) and GitHub REST API (`api.github.com`), queried 2026-08-09, for version dist-tags, first-publish dates, and star/issue counts.
