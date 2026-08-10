# OpenRouter text-model candidates for description parsing

Research date: 2026-08-10

## Summary

- The task is **estimation, not transcription**: turning free text like "double espresso with oat milk up to the spout of the frothing cup" into structured ingredients/quantities/nutrition estimates, following a fixed output schema reliably. The two properties that matter most are (a) native structured-output / JSON-schema support so the harness can trust the shape of the response, and (b) some published signal on instruction-following or function-calling accuracy, since that's the closest public proxy for "follows a schema and reasons sensibly," rather than open-ended chat quality.
- All pricing, context-window, and "supports structured output / tools" data below comes directly from OpenRouter's public model-listing API (`https://openrouter.ai/api/v1/models`, no auth required), fetched live during this research session. Per-model `supported_parameters` in that response is the primary signal for whether OpenRouter's own routing layer exposes `response_format`/`structured_outputs`/`tools` for a given model — all six shortlisted models expose `structured_outputs` and `tools`.
- No independent, apples-to-apples benchmark exists that scores "structured *extraction with domain reasoning*" the way this ticket needs — that gap is exactly why issue #25 (bake-off) exists. What's cited below are the closest available primary-source proxies: the Berkeley Function-Calling Leaderboard (BFCL) methodology, provider-published JSON-schema-adherence numbers, and IFEval instruction-following scores. These are flagged per-candidate as proxy signal, not a direct measurement of the target task.
- Six candidates are shortlisted below, spanning roughly 100x in price (from ~$0.05/1M input tokens to ~$1–5/1M) so the bake-off in #25 can trade off cost against reasoning/reliability empirically rather than by assumption. Per the ticket, this is a single shortlist for a single eventual model choice — no two-tier fallback structure is proposed here.

## Method note

Primary sources used: OpenRouter's public models API (pricing/context/supported-parameters, fetched directly, not scraped from the marketing pages), each provider's own API docs for structured-output/JSON-mode/function-calling mechanics (OpenAI, Google, DeepSeek, Anthropic, Qwen technical report), and the Berkeley Function-Calling Leaderboard (BFCL) as the standard third-party instrument for function-calling/structured-output-adjacent evaluation. Where only secondary aggregation was available (e.g. IFEval scores reported by press coverage rather than found on OpenAI's own gated model page, which returned HTTP 403 during this session), that is flagged explicitly.

## Shortlist

### 1. `openai/gpt-4.1-nano` — cheapest OpenAI tier, native strict schema mode

- **Pricing** (OpenRouter API, live fetch): $0.10 / 1M input tokens, $0.40 / 1M output tokens (prompt `0.0000001`, completion `0.0000004`); cached input reads at $0.025/1M.
- **Context window:** 1,047,576 tokens.
- **Structured output support:** OpenRouter lists `structured_outputs`, `response_format`, `tools`, `tool_choice` in `supported_parameters` for this model — same JSON-schema mechanism as the rest of the GPT-4.1/4o family.
- **Benchmark signal:** OpenAI's own Structured Outputs launch post reports that GPT-4o-2024-08-06 with Structured Outputs (`strict: true`) scores **100%** on OpenAI's internal complex-JSON-schema-following eval, versus **<40%** for GPT-4-0613 without it ([openai.com/index/introducing-structured-outputs-in-the-api](https://openai.com/index/introducing-structured-outputs-in-the-api/)) — the mechanism (constrained decoding against the schema) is shared across the whole GPT-4.1/4o family including nano, so this is evidence for the *class* of model rather than nano specifically. On IFEval instruction-following, GPT-4.1 scores 87.4% and GPT-4.1 mini scores 84.1%, per OpenAI's GPT-4.1 announcement as reported by secondary coverage (OpenAI's own `openai.com/index/gpt-4-1/` page returned HTTP 403 to a direct fetch in this session, so the number is sourced from press coverage quoting it, not independently re-verified against OpenAI's page — flagged as unverified-at-primary-source). No nano-specific IFEval figure was found.
- **Why shortlisted:** floor-of-the-market pricing for a model with OpenAI's constrained-decoding structured-output guarantee, which directly targets "follow a structured-output schema reliably."

### 2. `openai/gpt-4o-mini` — established mid-tier baseline

- **Pricing:** $0.15 / 1M input, $0.60 / 1M output (prompt `0.00000015`, completion `0.0000006`); cached input reads at $0.075/1M.
- **Context window:** 128,000 tokens.
- **Structured output support:** OpenRouter lists `structured_outputs`, `response_format`, `tools`, `tool_choice`, `logprobs`, `top_logprobs` — the widest `supported_parameters` set of the six candidates, including `logprobs`, which is relevant if the bake-off wants to derive confidence from token probabilities (see issue #18's confidence-signal research).
- **Benchmark signal:** Same OpenAI Structured Outputs mechanism/eval cited above (`json_schema` response format explicitly supported for `gpt-4o-mini` per OpenAI's launch documentation, corroborated by third-party guides: [firecrawl.dev structured-outputs guide](https://www.firecrawl.dev/blog/using-structured-output-and-json-strict-mode-openai), [OpenAI developer docs](https://developers.openai.com/api/docs/guides/structured-outputs)).
- **Why shortlisted:** the most widely-used low-cost structured-extraction model in the ecosystem, giving the bake-off a well-understood reference point rather than only newer/less-battle-tested models.

### 3. `google/gemini-2.5-flash-lite` — cheapest Google tier, schema-constrained JSON mode

- **Pricing:** $0.10 / 1M input, $0.40 / 1M output (prompt `0.0000001`, completion `0.0000004`); cached input reads at $0.01/1M.
- **Context window:** 1,048,576 tokens.
- **Structured output support:** OpenRouter lists `structured_outputs`, `response_format`, `reasoning`/`reasoning_effort`, `tools`, `tool_choice`. Google's own docs describe `response_schema` + `response_mime_type: application/json` as the mechanism to get output that "always adheres to a specific schema," explicitly distinguishing this from unconstrained "JSON mode" which is only a soft hint ([ai.google.dev structured-output guide, via Firebase AI Logic docs mirror](https://firebase.google.com/docs/ai-logic/generate-structured-output)). Google's own blog on the feature confirms JSON Schema support now spans "all actively supported Gemini models," though it does not publish comparative accuracy numbers for it ([blog.google — Improving Structured Outputs in the Gemini API](https://blog.google/innovation-and-ai/technology/developers-tools/gemini-api-structured-outputs/)).
- **Why shortlisted:** matches gpt-4.1-nano on price with a different vendor's schema-constrained-decoding mechanism, useful diversity for the bake-off given the two vendors' structured-output implementations differ in maturity/edge-case behaviour.

### 4. `deepseek/deepseek-chat-v3.1` — cheap open-weight with strict function-calling mode

- **Pricing:** $0.25 / 1M input, $0.95 / 1M output (prompt `0.00000025`, completion `0.00000095`); cached input reads at $0.13/1M.
- **Context window:** 163,840 tokens.
- **Structured output support:** OpenRouter lists `structured_outputs`, `response_format`, `tools`, `tool_choice`, `reasoning`. DeepSeek's own API docs describe a `strict` mode for tool calls that "strictly adheres to the format requirements of the Function's JSON schema," plus a separate `response_format: {"type": "json_object"}` JSON-output mode ([api-docs.deepseek.com/guides/function_calling](https://api-docs.deepseek.com/guides/function_calling), [api-docs.deepseek.com/guides/tool_calls](https://api-docs.deepseek.com/guides/tool_calls/)).
- **Benchmark signal:** No DeepSeek-published BFCL-style number was located directly on DeepSeek's own docs in this session; the JSON-schema-strict-mode claim above is the direct primary-source evidence for structured-output reliability rather than a leaderboard score.
- **Why shortlisted:** meaningfully cheaper than the Anthropic/GPT-4o tiers while still offering an explicit schema-strict tool-calling mode, giving the bake-off an open-weight cost/quality anchor.

### 5. `qwen/qwen3-30b-a3b-instruct-2507` — cheapest overall, open-weight

- **Pricing:** ~$0.048 / 1M input, ~$0.193 / 1M output (prompt `0.00000004815`, completion `0.00000019305`) — the cheapest model in this shortlist by a wide margin.
- **Context window:** 262,144 tokens.
- **Structured output support:** OpenRouter lists `structured_outputs`, `response_format`, `tools`, `tool_choice`.
- **Benchmark signal:** The Qwen3 Technical Report reports the flagship Qwen3-235B-A22B scoring **70.8 on BFCL v3** (function-calling/tool-use benchmark) ([arXiv:2505.09388](https://arxiv.org/pdf/2505.09388)). This 30B-A3B instruct variant is a smaller model in the same family/training pipeline rather than the exact model benchmarked, so the 70.8 figure is family-level proxy signal, not a verified score for this specific checkpoint — flagged accordingly.
- **Why shortlisted:** at ~1/20th the per-token cost of gpt-4o-mini, this tests whether a materially cheaper open-weight model is "good enough" for the estimation task before paying for a proprietary-tier model — a genuine floor-of-the-market data point for the bake-off.

### 6. `anthropic/claude-haiku-4.5` — most capable/most expensive tier in this shortlist

- **Pricing:** $1.00 / 1M input, $5.00 / 1M output (prompt `0.000001`, completion `0.000005`); cached input reads at $0.10/1M, cache writes $1.25/1M (5-min) or $2.00/1M (1-hr).
- **Context window:** 200,000 tokens.
- **Structured output support:** OpenRouter lists `structured_outputs`, `response_format`, `tools`, `tool_choice`, `reasoning`. Anthropic's own Haiku 4.5 announcement confirms tool-calling and structured-output support as a core capability of the release ([anthropic.com/news/claude-haiku-4-5](https://www.anthropic.com/news/claude-haiku-4-5)).
- **Benchmark signal:** Anthropic's announcement reports Haiku 4.5 scoring **>73% on SWE-bench Verified** — a coding-agent benchmark, not structured-extraction, but the closest Anthropic-published quantitative signal located this session; no Anthropic-published BFCL or JSON-schema-accuracy number was found. Treat as weak/indirect signal only, flagged accordingly — the number reflects agentic coding competence, not extraction accuracy.
- **Why shortlisted:** the ticket's estimation task ("reason about typical food composition and portion sizes") plausibly needs stronger world-knowledge reasoning than the cheapest tiers offer; Haiku 4.5 anchors the top of the price range so the bake-off can measure whether the extra cost buys materially better estimates.

## Pricing comparison (all figures per OpenRouter API, live fetch this session)

| Model | Input $/1M | Output $/1M | Context | Native structured-output flag (OpenRouter) |
|---|---|---|---|---|
| `qwen/qwen3-30b-a3b-instruct-2507` | $0.048 | $0.193 | 262,144 | yes |
| `openai/gpt-4.1-nano` | $0.10 | $0.40 | 1,047,576 | yes |
| `google/gemini-2.5-flash-lite` | $0.10 | $0.40 | 1,048,576 | yes |
| `openai/gpt-4o-mini` | $0.15 | $0.60 | 128,000 | yes |
| `deepseek/deepseek-chat-v3.1` | $0.25 | $0.95 | 163,840 | yes |
| `anthropic/claude-haiku-4.5` | $1.00 | $5.00 | 200,000 | yes |

## Gaps / what a follow-up (or the bake-off itself) should resolve

- No primary source located gives a like-for-like "structured food/nutrition extraction" benchmark for any of these models — the bake-off in issue #25 is the first point at which that gap gets closed empirically for this specific task.
- OpenAI's GPT-4.1 announcement page (`openai.com/index/gpt-4-1/`) returned HTTP 403 to a direct fetch in this session; the IFEval numbers cited for GPT-4.1/4.1-mini are sourced from press coverage quoting that page, not independently re-verified against OpenAI's own copy. Worth a quick re-check before treating as authoritative.
- DeepSeek and Qwen do not appear to publish a BFCL or equivalent function-calling score for the exact checkpoints listed here (`deepseek-chat-v3.1`, `qwen3-30b-a3b-instruct-2507`) — the Qwen figure cited is for a different (larger) model in the same family, and no DeepSeek figure was found at all. Both are flagged as proxy-only above.
- The Berkeley Function-Calling Leaderboard (BFCL v4, `gorilla.cs.berkeley.edu/leaderboard.html`) is the standard instrument for this kind of signal, but its live leaderboard table did not render in a text-only fetch during this session — a follow-up should load it in a way that captures the actual per-model table (e.g. checking the underlying JSON/CSV data source referenced by the page, or the HuggingFace dataset mirror at `huggingface.co/datasets/gorilla-llm/Berkeley-Function-Calling-Leaderboard`) rather than relying on the numbers already cited above.
