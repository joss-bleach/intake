import { Duration, Effect } from "effect";
import { db } from "../db";
import { modelCalls, modelCallOutcome } from "../db/schema";
import { captureEffectFailure } from "./glitchtip";

export type ModelCallOutcome = (typeof modelCallOutcome)[number];

export type ModelCallRecord = {
  readonly correlationId: string;
  readonly pipelineStage: string;
  readonly model: string;
  readonly outcome: ModelCallOutcome;
  readonly latencyMs: number;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly costUsd?: number;
};

// Caps how long a tracked AI call (src/ai/effect-ai-sdk.ts's withTracking
// sequences this write before resolving) can be held up by a slow/unreachable
// Postgres — a hung DB write must never turn into a hung AI response.
const WRITE_TIMEOUT = Duration.seconds(2);

/**
 * Writes one `model_calls` row (issue #49). Best-effort and bounded: a write
 * failure or a write that exceeds `WRITE_TIMEOUT` never fails — or retries —
 * the AI call it's recording. Reported to GlitchTip via `captureEffectFailure`
 * and otherwise swallowed; `captureEffectFailure` itself is wrapped in a
 * plain try/catch so a broken reporting path can't leak a defect back into
 * the caller either.
 */
export const recordModelCall = (
  record: ModelCallRecord,
): Effect.Effect<void> =>
  Effect.tryPromise(() =>
    db.insert(modelCalls).values({
      correlationId: record.correlationId,
      pipelineStage: record.pipelineStage,
      model: record.model,
      outcome: record.outcome,
      latencyMs: record.latencyMs,
      promptTokens: record.promptTokens ?? null,
      completionTokens: record.completionTokens ?? null,
      costUsd: record.costUsd === undefined ? null : String(record.costUsd),
    }),
  ).pipe(
    Effect.timeout(WRITE_TIMEOUT),
    Effect.asVoid,
    Effect.catchAllCause((cause) =>
      Effect.sync(() => {
        try {
          captureEffectFailure(cause);
        } catch {
          // Reporting the reporting failure isn't worth a second layer —
          // this must still resolve, not throw.
        }
      }),
    ),
  );
