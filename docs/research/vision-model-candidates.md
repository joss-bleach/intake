# OpenRouter vision-model candidates for label-photo OCR bake-off

Research date: 2026-08-10

## Question

Issue [#23](https://github.com/joss-bleach/intake/issues/23) (child of the map, issue #1): which
OpenRouter-available vision-capable models are viable candidates for the label-photo OCR
bake-off — spanning a **primary cheap-fast tier** and a **powerful fallback tier** (the ADR 0001
retry-on-`ParseFailure` model, per issue #4's decision log — cost is explicitly not a constraint
for this tier, per issue #7's methodology). The task is transcription of a printed nutrition
label, not free-form visual estimation, so the benchmark signal that matters most is
OCR/document-understanding/structured-extraction quality, not general chat/reasoning benchmarks.
This document surfaces candidates only — it does not run the bake-off (that's issue #25) or pick
a winner (issue #26).

## Method

- **Vision capability and pricing**: pulled directly from OpenRouter's public models API,
  `https://openrouter.ai/api/v1/models` (no auth required), fetched 2026-08-10. Filtered to
  models where `architecture.input_modalities` includes `"image"` — 237 of the ~700+ listed
  endpoints. This is the primary source of record for "is this model vision-capable on
  OpenRouter" and for OpenRouter's own listed per-token pricing (`pricing.prompt` /
  `pricing.completion`, USD per token) and, where the provider bills it separately,
  `pricing.image` (USD per image, distinct from a documented free vision-tokens-via-prompt
  scheme some providers use).
- **Benchmark signal**: followed back to each provider's own technical report/model card/blog
  where possible. Where a primary PDF/report existed but its numeric tables weren't extractable
  through the fetch tooling available in this session (noted per-model below), the qualitative
  claim is still sourced to the primary document with the caveat that exact scores need a manual
  re-check before being load-bearing for anything more than shortlisting.
- Cross-provider OCR-specific benchmark: [OCR Arena](https://www.ocrarena.ai) (built by extend.ai)
  runs head-to-head human-voted comparisons specifically on OCR/document transcription output
  across providers, distinct from general chat-arena benchmarks. Treated as corroborating
  signal, not primary — it's a third-party leaderboard, not a vendor's own claim.

## Pricing snapshot (OpenRouter, per-token USD, 2026-08-10)

| Model id | Prompt $/tok | Completion $/tok | Image $/img | Context |
|---|---|---|---|---|
| `google/gemini-2.5-flash-lite` | 0.0000001 | 0.0000004 | 0.0000001 | 1,048,576 |
| `qwen/qwen3-vl-8b-instruct` | 0.000000117 | 0.000000455 | — (token-billed) | 262,144 |
| `mistralai/mistral-small-3.2-24b-instruct` | 0.00000009375 | 0.00000025 | — (token-billed) | 256,000 |
| `qwen/qwen3-vl-30b-a3b-instruct` | 0.00000015 | 0.0000006 | — (token-billed) | 262,144 |
| `openai/gpt-4o-mini` | 0.00000015 | 0.0000006 | — (token-billed) | 128,000 |
| `openai/gpt-5-mini` | 0.00000025 | 0.000002 | — (token-billed) | 400,000 |
| `google/gemini-2.5-pro` | 0.00000125 | 0.00001 | 0.00000125 | 1,048,576 |
| `openai/gpt-5` | 0.00000125 | 0.00001 | — (token-billed) | 400,000 |
| `qwen/qwen3-vl-235b-a22b-instruct` | 0.00000021 | 0.0000019 | — (token-billed) | 262,144 |
| `anthropic/claude-sonnet-5` | 0.000002 | 0.00001 | — (token-billed) | 1,000,000 |
| `anthropic/claude-opus-5` | 0.000005 | 0.000025 | — (token-billed) | 1,000,000 |

"— (token-billed)" means the provider doesn't bill images as a separate line item on
OpenRouter; the image is converted to input tokens by the provider's own tokenizer and billed at
the prompt rate, which is the common OpenAI/Anthropic/Qwen/Mistral pattern. Google is the outlier
that lists an explicit `pricing.image` figure alongside token pricing. Source for all rows:
`https://openrouter.ai/api/v1/models`, cross-checked against the equivalent listing at
[openrouter.ai/models](https://openrouter.ai/models) (filterable by "Input Modalities: Image").

---

## Primary tier — cheap, fast

### 1. `google/gemini-2.5-flash-lite`
- **Vision**: confirmed (`input_modalities: [text, image, file, audio, video]`), OpenRouter API.
- **Price**: $0.0000001/prompt-token, $0.0000004/completion-token, $0.0000001/image — the
  cheapest vision-capable model considered here by a wide margin.
- **Context**: 1,048,576 tokens.
- **OCR/document signal**: Google's own Gemini 2.5 technical report (arXiv 2507.06261,
  [arxiv.org/pdf/2507.06261](https://arxiv.org/pdf/2507.06261)) covers the Flash-Lite variant as
  part of the 2.5 family's "advanced reasoning, multimodality, long context" claims; the report
  is the primary source but this session's tooling could not extract the specific DocVQA-class
  numeric table from the PDF — treat as a claim to re-verify, not a cited number. Corroborating
  third-party signal: [OCR Arena](https://www.ocrarena.ai) ranks Gemini 2.5 Flash (non-lite) at
  #6 on its head-to-head OCR leaderboard (ELO 1680) per a Roboflow writeup summarizing the
  leaderboard (secondary, cites OCR Arena as its source) — flash-lite is a smaller/cheaper sibling
  of that same family, not independently ranked there as of this fetch.
- **Why shortlisted**: lowest cost of any vision model on OpenRouter with a 1M-token context
  headroom and native per-image billing, from a provider (Google) whose flash line is
  purpose-marketed for high-volume document/OCR workloads.

### 2. `qwen/qwen3-vl-30b-a3b-instruct` (and smaller sibling `qwen/qwen3-vl-8b-instruct`)
- **Vision**: confirmed (`input_modalities: [text, image]`), OpenRouter API.
- **Price**: 30B-A3B — $0.00000015/prompt-token, $0.0000006/completion-token. 8B — even
  cheaper at $0.000000117/$0.000000455.
- **Context**: 262,144 tokens (both).
- **OCR/document signal**: Qwen's own Qwen3-VL Technical Report (arXiv 2511.21631,
  [arxiv.org/abs/2511.21631](https://arxiv.org/abs/2511.21631) /
  [arxiv.org/pdf/2511.21631](https://arxiv.org/pdf/2511.21631)) states the 235B-A22B flagship
  variant was evaluated specifically against OCR-focused parsing benchmarks — **CC-OCR** and
  **OmniDocBench** — plus comprehensive OCR benchmarks **OCRBench** and **OCRBench_v2** (Table 2
  of the report), and separately documents expanded OCR language coverage (32 languages, up from
  10 in Qwen2.5-VL) and explicit robustness claims for low light, blur, and tilt — directly
  relevant to real phone photos of a printed label. This session's tooling could not extract the
  exact numeric scores from the PDF table; the *existence and choice* of OCR-specific benchmarks
  (rather than only general VQA/chat benchmarks) is itself the primary-source signal worth
  noting, and should be re-verified with exact numbers before being load-bearing. The smaller
  30B-A3B/8B variants in the same family inherit the same OCR-focused training/eval approach per
  the report, though the technical report's headline numbers are for the 235B flagship.
- **Why shortlisted**: Qwen-VL is the one model family here whose own technical report
  explicitly targets OCR/document-parsing benchmarks (not just general vision QA) as a named
  eval axis, at a very low per-token price; a strong match for "transcribe printed text
  accurately" as opposed to "describe/reason about an image."

### 3. `openai/gpt-4o-mini`
- **Vision**: confirmed (`input_modalities: [text, image, file]`), OpenRouter API.
- **Price**: $0.00000015/prompt-token, $0.0000006/completion-token (image billed as tokens).
- **Context**: 128,000 tokens.
- **OCR/document signal**: no OpenAI-published OCR-specific benchmark found for the mini
  variant specifically; general vision-eval writeups (Roboflow's GPT-4o vision guide, secondary
  source) cite ~94% average accuracy across OCR test domains for GPT-4o (the full model, not
  confirmed to transfer identically to mini) versus GPT-4V. Included primarily for breadth and
  ecosystem maturity (widest real-world deployment of any model on this list, well-documented
  vision-input behavior) rather than a strong OCR-specific benchmark claim — should be treated as
  the "known quantity" baseline candidate rather than the strongest cheap-tier pick on accuracy
  signal alone.
- **Why shortlisted**: cheap, ubiquitous, well-documented vision behavior; useful as a baseline
  in the bake-off even though its OCR-specific benchmark evidence is thinner than Gemini's or
  Qwen's.

### 4. `mistralai/mistral-small-3.2-24b-instruct`
- **Vision**: confirmed (`input_modalities: [image, text]`), OpenRouter API.
- **Price**: $0.00000009375/prompt-token, $0.00000025/completion-token — cheapest per-token
  completion rate of any candidate here.
- **Context**: 256,000 tokens.
- **OCR/document signal**: no dedicated OCR benchmark found in Mistral's own release notes for
  this checkpoint during this session's search; included as a low-cost outlier for price
  contrast in the bake-off, not on strength of published OCR evidence. Flag this gap explicitly
  if it's carried into the actual bake-off shortlist — it needs its own eval-harness data point
  rather than a benchmark citation to justify inclusion.

---

## Fallback tier — powerful, cost-agnostic (also the ADR 0001 retry-on-`ParseFailure` model)

### 1. `google/gemini-2.5-pro`
- **Vision**: confirmed (`input_modalities: [text, image, file, audio, video]`), OpenRouter API.
- **Price**: $0.00000125/prompt-token, $0.00001/completion-token, $0.00000125/image.
- **Context**: 1,048,576 tokens.
- **OCR/document signal**: same Gemini 2.5 technical report as above
  ([arxiv.org/pdf/2507.06261](https://arxiv.org/pdf/2507.06261)) positions Pro as the
  higher-capability sibling in the same multimodal/document-processing family; per the
  Roboflow-summarized OCR Arena leaderboard, Gemini 2.5 Pro placed #8 (ELO 1670) — essentially on
  par with Flash on that specific OCR arena, i.e. the extra cost over Flash does not show a large
  OCR-specific accuracy jump on that leaderboard, worth factoring into the actual bake-off. Note
  a newer preview, `google/gemini-3.1-pro-preview` ($0.000002/$0.000012, same context), is also
  listed on OpenRouter as of this fetch if the bake-off wants the latest Gemini frontier
  checkpoint instead — not separately benchmarked here since it's a preview.
- **Why shortlisted**: flagship-tier document/OCR capability from the same family already
  shortlisted for the primary tier, native per-image billing, largest context window on the
  list (matters if the eval harness batches multiple label crops per call).

### 2. `openai/gpt-5`
- **Vision**: confirmed (`input_modalities: [text, image, file]`), OpenRouter API.
- **Price**: $0.00000125/prompt-token, $0.00001/completion-token (image billed as tokens).
- **Context**: 400,000 tokens.
- **OCR/document signal**: no GPT-5-specific OCR benchmark located in this session (GPT-5 postdates
  this session's search corpus' best-covered sources, which cluster around GPT-4.1/4o); GPT-4.1's
  own announcement (OpenAI, [openai.com/index/gpt-4-1](https://openai.com/index/gpt-4-1/)) is the
  clearest primary OpenAI vision-benchmark statement found — cited via secondary summary as
  testing "seven vision tasks covering object counting, VQA, document OCR, document question
  answering, real-world OCR, and object detection," with GPT-4.1 passing five of seven — but the
  exact task-level scores need pulling directly from that OpenAI blog page (not fully extracted
  in this session). Flag this as the weakest-sourced fallback candidate on OCR-specific grounds;
  it's included for capability breadth and provider-diversity in the bake-off, not because a
  strong document-OCR benchmark was confirmed here.
- **Why shortlisted**: current OpenAI flagship, natural fallback pairing if the primary tier
  also runs an OpenAI model, cost genuinely irrelevant for this tier per issue #7's methodology.

### 3. `anthropic/claude-opus-5` (flagship) / `anthropic/claude-sonnet-5` (mid-tier, cheaper fallback option)
- **Vision**: confirmed for both (`input_modalities: [text, image, file]`), OpenRouter API.
- **Price**: Opus 5 — $0.000005/prompt-token, $0.000025/completion-token. Sonnet 5 —
  $0.000002/prompt-token, $0.00001/completion-token (image billed as tokens for both).
- **Context**: 1,000,000 tokens (both).
- **OCR/document signal**: Anthropic's Claude 3.5 Sonnet model card addendum (Anthropic,
  [www-cdn.anthropic.com/.../Model_Card_Claude_3_Addendum.pdf](https://www-cdn.anthropic.com/fed9cc193a14b84131812372d8d5857f8f304c52/Model_Card_Claude_3_Addendum.pdf))
  is the primary Anthropic document making a document-understanding claim — secondary summaries
  describe it as citing "state-of-the-art performance on evaluations including document
  understanding (DocVQA)" alongside ChartQA/MathVista — but this session's PDF-fetch tooling
  could not extract the underlying numeric table, and no equivalent model-card addendum was
  locatable for the Opus 5 / Sonnet 5 generation specifically (those model ids postdate the
  addendum found). Treat the DocVQA claim as inherited family reputation (Claude's vision line
  has repeatedly emphasized "accurately transcribes text from imperfect images" as a stated
  design goal per Anthropic's own product messaging) rather than a verified current-generation
  number — needs a direct re-check against whatever model card Anthropic has published for Opus
  5/Sonnet 5 before being load-bearing.
- **Why shortlisted**: third major-provider flagship for the bake-off's provider diversity;
  Sonnet 5 in particular is a meaningfully cheaper fallback than Opus 5 or GPT-5 while still
  being Anthropic's top non-Opus tier, worth including as a mid-cost fallback option rather than
  only the most expensive candidate per family.

### 4. `qwen/qwen3-vl-235b-a22b-instruct`
- **Vision**: confirmed (`input_modalities: [text, image]`), OpenRouter API.
- **Price**: $0.00000021/prompt-token, $0.0000019/completion-token — notably cheaper than every
  other fallback-tier candidate here despite being the flagship of its family.
- **Context**: 262,144 tokens.
- **OCR/document signal**: this is the variant the Qwen3-VL technical report's Table 2
  benchmarks (CC-OCR, OmniDocBench, OCRBench, OCRBench_v2 — see primary-tier entry above for full
  citation) were run against, i.e. it's the flagship the OCR-specific claims in that report were
  actually measured on, not an inference from a smaller sibling.
- **Why shortlisted**: if the eval harness's OCR-specific results bear out the technical
  report's framing, this is the strongest documented OCR-benchmark case of any candidate here —
  and it undercuts every other fallback-tier candidate on price, which matters even though cost
  is deprioritized for this tier (per issue #7), since a cheaper-and-good fallback is strictly
  better than an expensive-and-equally-good one.

---

## Gaps and caveats to carry into the bake-off (issue #25)

- Several numeric benchmark tables (Qwen3-VL's OCRBench/CC-OCR/OmniDocBench scores, Anthropic's
  DocVQA score, OpenAI's GPT-4.1 seven-task pass breakdown) are cited to a specific primary
  document but the exact numbers weren't extractable through this session's PDF/page-fetch
  tooling. Re-pull these directly (a plain download + local read, rather than a URL-fetch
  summarizer) before treating any specific score as settled — what's confirmed here is *that*
  the benchmark was run and *by which provider*, not the number itself.
- No OCR-specific benchmark evidence was found at all for `mistralai/mistral-small-3.2-24b-instruct`
  or for the mini/nano OpenAI vision tiers beyond GPT-4.1's general vision-task summary — these
  are price-shortlisted, not benchmark-shortlisted, and should be weighted accordingly (or dropped)
  once the eval harness (issue #6) produces real numbers.
- `openai/gpt-5` and `anthropic/claude-opus-5`/`claude-sonnet-5` postdate the best-covered public
  benchmark writeups found in this session's search; their inclusion here rests on being the
  current flagship of an established, vision-benchmarked model family rather than a
  generation-specific OCR benchmark citation. Worth a follow-up search once each provider
  publishes a model card for these specific ids.
- OCR Arena (ocrarena.ai) is the only benchmark source found that evaluates OCR output
  head-to-head across providers on the same footing; its full current leaderboard (including
  Qwen3-VL, Claude 5, and GPT-5 entries, if present) should be re-checked directly rather than
  through the secondary Roboflow summary used here, since this session's own fetch of the
  leaderboard page didn't return the underlying data table.
