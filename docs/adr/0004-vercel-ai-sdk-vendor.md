# Vercel AI SDK as the AI vendor SDK

**Status:** accepted

**Context:** Both AI logging pipelines (description parsing, label-photo reading) need an SDK to call OpenRouter models with streaming and tool-calling, and to validate output against Effect Schema. The brief already leaned toward the Vercel AI SDK; this ADR checks that lean against two alternatives — TanStack AI (Beta) and `@effect/ai` — given the project's Effect-first architecture. Full comparison: [research/ai-sdk-vendor-comparison](https://github.com/joss-bleach/intake/tree/research/ai-sdk-vendor-comparison/docs/research/ai-sdk-vendor-comparison.md) (issue #10).

**Decision:**

**Vendor.** Vercel AI SDK (`ai`). It's the only option with a stable, production-proven major version and a long track record (repo since 2023, ~26.1k stars). `@effect/ai` is explicitly labeled experimental/alpha by its own docs and is mid-migration to an in-progress Effect v4 beta — too much adoption risk for a core dependency. TanStack AI is real and shipping but young (~8 months old, sub-1.0, 40+ releases), and its Standard Schema/Effect Schema compatibility is unverified. The SDK's adoption of the Standard Schema interface means Effect Schema (which implements Standard Schema) should plug into `generateObject`/tool schemas without a translation layer, closing most of the gap that would otherwise favor `@effect/ai`.

**OpenRouter integration.** Via `@openrouter/ai-sdk-provider` — maintained by OpenRouter's own team (not an official Vercel package), healthy and active (420+ dependents, ~672 stars, not archived). Accepted as-is; no fallback trigger defined, matching MVP-scope risk tolerance for this project's other vendor dependencies.

**Effect integration.** The SDK has no native Effect/Layer composition — every call is wrapped by hand. Wrapping is standardized now, not deferred to the build phase: a `src/ai/effect-ai-sdk.ts` module exposes one Effect-returning function per AI SDK operation actually used (e.g. `generateObjectEffect`, `streamTextEffect`), rather than one generic `runAiSdk(fn)` wrapper. One-shot calls (`generateObject`/`generateText`) wrap via `Effect.tryPromise`; streaming calls (`streamText`/`streamObject`) wrap their async-iterable stream via `Stream.fromAsyncIterable`. Both fail with a single tagged `AiSdkError`. Nothing outside this module imports `ai` directly.

## Considered options

- **`@effect/ai`** — rejected: the only option with native Effect Schema and Effect/Layer composition, directly matching two of the project's architectural commitments, but explicitly alpha, mid-rework against an unstable Effect v4 beta, and its `@effect/ai-openrouter` package is thin and undocumented relative to its OpenAI/Anthropic integrations. Too much risk for a core dependency at MVP.
- **TanStack AI** — rejected: real, shipping, first-party OpenRouter adapter, multi-framework streaming — a credible middle ground, but sub-1.0 with high version churn and unconfirmed Standard Schema/Effect Schema compatibility.
- **Generic `runAiSdk(fn)` Effect wrapper** — rejected in favor of per-call wrappers: one-shot and streaming calls need genuinely different Effect primitives (`Effect.tryPromise` vs `Stream.fromAsyncIterable`), so a single generic wrapper either loses type accuracy or ends up being two wrappers anyway, just undeclared. Per-call wrappers keep the `ai` import confined to one module and match ADR 0001's tagged-error pattern, at the cost of one small wrapper per operation adopted — cheap given the project only needs two or three calls total.

## Consequences

- No Effect-native ergonomics from the vendor itself — the project owns and maintains the `effect-ai-sdk.ts` wrapper module indefinitely; every new AI SDK operation adopted needs its own wrapper function added there.
- OpenRouter support depends on a third party (OpenRouter's team, not Vercel) continuing to maintain `@openrouter/ai-sdk-provider`. Accepted without a defined fallback trigger — revisit only if it's archived or clearly stops tracking new `ai` majors.
- Standard Schema compatibility (Effect Schema straight into `generateObject`/tool schemas) is expected but not yet verified against real code — first real usage (the description-parsing pipeline) should confirm this early, since the whole ADR leans on it.
