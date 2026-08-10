# Deriving the `confident` / `needs_review` confidence signal

Research date: 2026-08-10

## Question

ADR 0001 ([docs/adr/0001-shared-llm-output-contract.md](../adr/0001-shared-llm-output-contract.md))
settled the *shape* of the confidence signal — a `"confident" | "needs_review"` enum per field —
but explicitly deferred the *mechanism* that populates it, spinning it off as issue
[#18](https://github.com/joss-bleach/intake/issues/18). This survey covers four candidate
mechanisms against primary sources (OpenRouter's own docs/API reference, the Vercel AI SDK's own
docs/source, and the original research papers behind the two prompting techniques), for both
pipelines: description-text parsing (LLM guesses ingredients/quantities from free text) and
label-photo parsing (vision-model OCR of a printed nutrition panel). **This document does not
pick model names** — that's issue [#7](https://github.com/joss-bleach/intake/issues/7) — it's
scoped to what signal is even available to threshold against.

---

## 1. Self-reported confidence via prompt instruction

**Feasibility.** Trivial to implement — add a `confidence: "confident" | "needs_review"` field
(or a raw 0–1 score cast down to the enum) to the Stage 2 Effect Schema and ask the model to fill
it in as part of the same structured-output call. No API feature dependency: it works identically
against any model/provider OpenRouter exposes, chat or vision, so it's the one mechanism that
doesn't fork between the two pipelines.

**Known failure mode — raw token-probability calibration is bad, but *verbalized* confidence is
better than the reputation it has.** Two primary-source findings worth holding in tension:

- Kadavath et al. (Anthropic), *"Language Models (Mostly) Know What They Know"* — shows
  sufficiently large models' raw next-token probabilities on multiple-choice-style
  self-evaluation ("is this proposed answer true?") are reasonably well calibrated, and
  calibration improves with model size and few-shot prompting.
  [arxiv.org/pdf/2207.05221](https://arxiv.org/pdf/2207.05221)
- Tian et al., *"Just Ask for Calibration"* (EMNLP 2023) — the more directly relevant finding for
  this app, since it studies RLHF-tuned chat models (the class everything on OpenRouter falls
  into): **RLHF fine-tuning dramatically degrades the token-probability calibration of a model —
  RLHF'd models are systematically overconfident in their raw conditional probabilities** — but
  *verbalized* confidence (literally asking "how confident are you?" as part of the output)
  recovers a meaningful fraction of that calibration, cutting expected calibration error roughly
  in half on the benchmarks tested (TriviaQA, SciQ, TruthfulQA), when prompted well.
  [arxiv.org/abs/2305.14975](https://arxiv.org/abs/2305.14975),
  [OpenReview PDF](https://openreview.net/pdf?id=g3faCfrwm7)

Net: self-reported confidence is not junk, but it is *not validated for this app's task type*
(ingredient-quantity guessing, nutrition-label transcription) — the calibration literature is
benchmarked on trivia/factual QA, not structured extraction or OCR-style transcription, and it
skews toward overconfidence in general. It should be treated as a **weak, cheap signal to combine
with something else**, not a standalone trust boundary for `needs_review`.

---

## 2. Token logprobs

**Does OpenRouter expose logprobs? Yes, but support is provider/model-dependent and partial.**
The OpenRouter API reference documents both parameters directly:

> `logprobs` — "Whether to return log probabilities of the output tokens or not. If true, returns
> the log probabilities of each output token returned."
> `top_logprobs` — "An integer between 0 and 20 specifying the number of most likely tokens to
> return at each token position, each with an associated log probability." Requires `logprobs` to
> be enabled.
[openrouter.ai/docs/api-reference/parameters](https://openrouter.ai/docs/api-reference/parameters)

However, this is a passthrough parameter, not a guarantee — OpenRouter proxies to whichever
upstream provider is serving a given model/endpoint, and not all of them implement it. An
independent measurement study (arXiv 2512.03816, *"Log Probability Tracking of LLM APIs"*)
crawled OpenRouter's reachable endpoints directly and found **only 23% of endpoints (164 of 710
reachable) actually returned logprobs when requested** — coverage concentrated in xAI (all
models), several OpenAI models (GPT-4.1 series), and open-weight families (Qwen, Gemma, Llama,
DeepSeek, Mistral). Anthropic's Claude models were not among the families reporting support.
The same paper also found returned logprobs are **noisy/non-deterministic over time for a given
model** (they show GPT-4.1's logprob for a fixed single-token prompt drifting over a two-week
measurement window), meaning even where available, a single logprob read is not a stable
threshold input without smoothing.
[arxiv.org/html/2512.03816v1](https://arxiv.org/html/2512.03816v1)

**Vision models specifically — no evidence of support, actively excluded from consideration
here.** OpenRouter's own parameter docs don't carve out an exception or note for image inputs;
the measurement paper "focuses exclusively on text-based language models" and doesn't test vision
inputs at all. On the OpenAI side (the underlying vendor of the vision models most likely in
play), community reports describe logprobs as already "flaky" on GPT-4o for plain text
completions (mismatched top-token indices, sentinel `-9999.0` values reported), before even
introducing an image in the prompt — see the OpenAI developer forum thread
[community.openai.com/t/flaky-logprobs-with-gpt-4o/1152027](https://community.openai.com/t/flaky-logprobs-with-gpt-4o/1152027)
(forum post, not itself a primary spec source, but the only concrete first-hand report found;
OpenAI's own API reference page for `chat/completions` could not be fetched directly in this
session — `platform.openai.com/docs/api-reference/chat/create` returned an HTTP 403 to the
fetch tool used here — so this claim should be treated as corroborating evidence, not a verified
primary-source guarantee, and re-checked against `platform.openai.com` directly before being
load-bearing).

**Does the Vercel AI SDK surface logprobs? Yes, for `generateText`, but with an open bug for
`generateObject`.** The AI SDK's OpenAI provider docs describe `providerOptions.openai.logprobs`
(`boolean | number`, 1–20) which is "useful to better understand how the model is behaving" but
"can slow down response times," with the result surfaced via `providerMetadata.openai.logprobs`
in the `generateText` result. Critically for this app's actual usage pattern — both pipelines want
*structured* output (a Stage 2 schema object, not free text) — the SDK's own GitHub issue tracker
has an open, unresolved report that **`generateObject` returns `logprobs: null` even when
requested, while the identical option works under `generateText`**:
[github.com/vercel/ai/issues/7481](https://github.com/vercel/ai/issues/7481). A second open issue
reports the `providerOptions.openai.logprobs` value being silently stripped before it reaches the
OpenAI API at all in some code paths:
[github.com/vercel/ai/issues/7767](https://github.com/vercel/ai/issues/7767). Both are unresolved
as of this research date — this is a real, current gap between what the docs describe and what
the SDK version in the wild does for the structured-output call shape this app needs.

**Verdict: not viable as the primary signal today.** Even setting aside the vision-model gap
(disqualifying it outright for the label-photo pipeline), the combination of (a) provider support
being a 23% minority on OpenRouter, (b) Anthropic-family models not among the supporting families,
(c) logprob values reported as noisy/non-deterministic even where present, and (d) an open,
unresolved AI SDK bug specifically affecting the `generateObject` structured-output path this app
depends on, makes logprobs an unreliable foundation to build a threshold on right now for either
pipeline. Worth re-checking if the SDK issues close and a fallback model is chosen from the
supporting-family list, since it's the one signal here with a principled statistical grounding
(an actual probability, not a self-report) rather than the alternatives below.

---

## 3. Multi-sample consistency checks

**Mechanism.** Run the same input N times (temperature > 0) and check agreement across the N
outputs — either literal self-consistency over the final structured value (do 3 of 3 samples agree
on the parsed quantity?) or majority vote when reasoning chains vary. This is not an OpenRouter or
AI SDK *feature* to look up — it's an orchestration pattern the app builds on top of ordinary
`generateObject` calls — so there is nothing to verify as "supported or not"; it works with any
model on any provider, chat or vision, with no API dependency. The originating technique is
Wang et al., *"Self-Consistency Improves Chain of Thought Reasoning in Language Models"*
(ICLR 2023) — sampling multiple reasoning paths and majority-voting the final answer improved
GSM8K accuracy from 56.5% (single sample) to 74.4% (40 samples), the largest primary-source
accuracy delta found in this research for any of the four mechanisms surveyed.
[Self-consistency paper (Toronto CSC2541 course PDF mirror)](https://www.cs.toronto.edu/~cmaddis/courses/csc2541_w25/presentations/self-consistency.pdf)

**Cost/latency tradeoff — the real constraint.** N samples means N full model calls: N× token
cost and, run sequentially, N× latency (parallelizable, but still N× the cost and N concurrent
provider calls per user action). The 40-sample regime from the original paper is a research
ceiling for maximizing benchmark accuracy, not a production-viable number for a per-item logging
interaction — a user logging a meal will not tolerate 40 parallel model calls' worth of latency or
cost per field. A small N (2–3) run in parallel is the only version of this technique that fits an
interactive logging flow; it buys a much smaller slice of the accuracy gain the paper demonstrates,
but at 2–3× cost/latency instead of 40×.

**How it'd apply differently per pipeline.**
- **Description parsing**: naturally suited — free-text interpretation is exactly the
  under-specified, multiple-valid-reading task self-consistency was designed for. Disagreement
  between samples (e.g. one run guesses "1 cup rice" as cooked, another as uncooked) is a
  meaningful, legible `needs_review` trigger a user can actually resolve.
  Adds 2–3× the fallback-retry cost already spent on `ParseFailure` handling (ADR 0001) — but the
  cost is on the same order of the retry-once-against-a-stronger-model policy already accepted
  there, not a new order of magnitude.
- **Label-photo OCR**: weaker fit. This is a transcription task, not an estimation task (ADR 0001
  is explicit that the label "already is the fact"), so running the same photo through the model
  N times mostly tests the model's *consistency*, not whether it read the panel correctly — a
  model can consistently misread a poorly-lit "3.5g" as "8.5g" across all N samples if the visual
  ambiguity is systematic (blur, glare, compression artifact) rather than random per-call
  variance. Multi-sampling here would catch stochastic misreads but not systematic ones, and
  vision calls are typically the more expensive/slower call type to begin with, so N× cost is a
  worse tradeoff on this pipeline than on the text pipeline.

---

## 4. Other established production patterns

- **Structured-output validation as a free, already-happening signal.** ADR 0001's Stage 2 is
  already Effect-Schema-validated, and the AI SDK's `generateObject` already throws
  `NoObjectGeneratedError` (carrying `cause`, the raw `text`, `response`, and `usage`) when a
  response can't be coerced to the schema at all
  [ai-sdk.dev/docs/reference/ai-sdk-core/generate-object](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-object).
  That's already the `ParseFailure` hard-failure channel ADR 0001 defines — it's a binary
  parse/no-parse signal, not a graded confidence one, but it costs nothing extra since the app
  already validates every response; it just doesn't help distinguish `confident` from
  `needs_review` *within* the successfully-validated set, which is the actual gap this ticket is
  about.
- **OpenRouter's "Response Healing" plugin** reduces the risk of malformed JSON reaching your
  schema validator in the first place, per OpenRouter's structured-outputs docs
  ([openrouter.ai/docs/features/structured-outputs](https://openrouter.ai/docs/features/structured-outputs)),
  but the docs frame it purely as a formatting-robustness feature, not a confidence signal —
  it doesn't expose anything to threshold against.
- **Ensemble-across-models** (query two different models on the same input, flag disagreement) is
  a variant of multi-sample consistency with a different cost profile — different models rather
  than repeated calls to one — but nothing in OpenRouter's or the AI SDK's docs makes this any
  more "supported" or turnkey than orchestrating it manually the same way multi-sampling would be;
  it's the same pattern with N=2 fixed and the two calls deliberately diversified by model
  instead of by temperature. Not separately surveyed in depth here since it inherits the same
  cost/orchestration tradeoffs as §3 above, and ADR 0001 already earmarks a designated
  stronger fallback model for the retry path — that same fallback call could double as the second
  ensemble member at effectively no extra plumbing cost beyond what ADR 0001 already commits to.

---

## Recommendation

**No single mechanism surveyed is a turnkey, provider-guaranteed confidence score.** Logprobs —
the only one with real statistical grounding — are gated behind partial OpenRouter provider
support, excluded from vision models entirely, and currently broken for the `generateObject`
structured-output call shape both pipelines actually use. Self-reported confidence is cheap and
provider-agnostic but is known-overconfident on the model class this app runs against and
unvalidated for this app's task types. That leaves a pragmatic combination, split by pipeline:

- **Description-parsing pipeline: verbalized self-reported confidence (field on the Stage 2
  schema, cast to the enum) as the default signal, backed by a cheap 2-sample consistency check
  (parallel, not sequential, to bound added latency) as the actual `needs_review` trigger when the
  two disagree on a parsed field.** This pipeline is the better fit for multi-sampling (§3) since
  it's a genuine multiple-valid-reading estimation task, and the added 2× cost lands on the same
  order as the retry-once policy ADR 0001 already accepts for `ParseFailure`. Use self-reported
  confidence as a first-pass filter to avoid spending the second sample call on fields the model
  already reports as low-confidence — route those straight to `needs_review` without waiting on
  agreement.
- **Label-photo pipeline: verbalized self-reported confidence only, with structured-output
  validation (`NoObjectGeneratedError` → `ParseFailure`) as the existing hard floor — do not build
  multi-sample consistency into this path.** Logprobs are unavailable for vision models on
  present evidence. Multi-sampling is a weaker fit here (§3) since OCR misreads are frequently
  systematic (image quality) rather than per-call-random, so repeated sampling risks *confirming*
  a wrong reading N times rather than catching it, while still paying vision-call-tier cost N
  times over. Self-reported confidence, while imperfectly calibrated, is at minimum a zero-marginal-
  cost signal already available inside the same structured-output call, and the task ("does this
  visually match the printed panel") is closer to the kind of localized correctness judgment a
  model can plausibly reflect on than free-form trivia recall.
- **Re-evaluate logprobs specifically once the fallback model (issue #7) is chosen**, if that
  choice lands on a model family the OpenRouter measurement study found actually returns them
  (xAI, GPT-4.1-class OpenAI models, or the listed open-weight families) *and* the two open AI SDK
  `generateObject`/logprobs issues (
  [#7481](https://github.com/vercel/ai/issues/7481),
  [#7767](https://github.com/vercel/ai/issues/7767)) are resolved. At that point logprobs on the
  chosen text/chat fallback model would be the strictly stronger signal to fold into the
  description-parsing pipeline's threshold — this is a "watch and revisit," not a blocker to
  building the eval harness (#6/#7) or the retry policy in ADR 0001 on the self-report +
  2-sample-consistency approach now.
- **For the eval harness (#6/#7)**: log the raw self-reported confidence value, the sample-
  agreement result (description pipeline only), and the final `confident`/`needs_review` enum
  together per field, not just the final enum — this is what will let a future pass tune the
  disagreement/self-report thresholds against real outcome data instead of guessing at them now,
  and is the concrete mechanism this ticket was asked to unblock for that harness.

---

## Sources

- ADR 0001 — [docs/adr/0001-shared-llm-output-contract.md](../adr/0001-shared-llm-output-contract.md)
- OpenRouter API reference, request parameters (`logprobs`, `top_logprobs`) —
  [openrouter.ai/docs/api-reference/parameters](https://openrouter.ai/docs/api-reference/parameters)
- OpenRouter structured outputs / Response Healing docs —
  [openrouter.ai/docs/features/structured-outputs](https://openrouter.ai/docs/features/structured-outputs)
- OpenRouter + Vercel AI SDK community integration guide (no logprobs/vision/structured-output
  mention found) —
  [openrouter.ai/docs/guides/community/vercel-ai-sdk](https://openrouter.ai/docs/guides/community/vercel-ai-sdk)
- Vercel AI SDK — OpenAI provider docs, `logprobs` provider option —
  [ai-sdk.dev/providers/ai-sdk-providers/openai](https://ai-sdk.dev/providers/ai-sdk-providers/openai)
- Vercel AI SDK — `generateObject` reference, `NoObjectGeneratedError` —
  [ai-sdk.dev/docs/reference/ai-sdk-core/generate-object](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-object)
- Vercel AI SDK GitHub issues (open, unresolved as of this research date) —
  [`generateObject` logprobs returns null: #7481](https://github.com/vercel/ai/issues/7481),
  [`providerOptions.openai.logprobs` not forwarded: #7767](https://github.com/vercel/ai/issues/7767)
- "Log Probability Tracking of LLM APIs" (measurement study of logprob availability/stability
  across OpenRouter endpoints) — [arxiv.org/html/2512.03816v1](https://arxiv.org/html/2512.03816v1)
- OpenAI developer forum: flaky/inconsistent logprobs reported on GPT-4o (corroborating, not
  primary-spec, evidence — `platform.openai.com/docs/api-reference/chat/create` returned HTTP 403
  to this session's fetch tool and could not be checked directly) —
  [community.openai.com/t/flaky-logprobs-with-gpt-4o/1152027](https://community.openai.com/t/flaky-logprobs-with-gpt-4o/1152027)
- Kadavath et al., "Language Models (Mostly) Know What They Know" (Anthropic) —
  [arxiv.org/pdf/2207.05221](https://arxiv.org/pdf/2207.05221)
- Tian et al., "Just Ask for Calibration: Strategies for Eliciting Calibrated Confidence Scores
  from Language Models Fine-Tuned with Human Feedback" (EMNLP 2023) —
  [arxiv.org/abs/2305.14975](https://arxiv.org/abs/2305.14975),
  [OpenReview PDF](https://openreview.net/pdf?id=g3faCfrwm7)
- Wang et al., "Self-Consistency Improves Chain of Thought Reasoning in Language Models"
  (ICLR 2023) — [course-hosted PDF mirror](https://www.cs.toronto.edu/~cmaddis/courses/csc2541_w25/presentations/self-consistency.pdf)
