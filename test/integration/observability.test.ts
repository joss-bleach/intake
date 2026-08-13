import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { generateTextEffect } from "../../src/ai/effect-ai-sdk";
import { db, pool } from "../../src/server/db";
import { migrate } from "../../src/server/db/migrate";
import { modelCalls } from "../../src/server/db/schema";
import { recordModelCall } from "../../src/server/observability/model-calls";
import { checkTripwire } from "../../src/server/observability/tripwire";
import { env } from "../../src/server/env";

// Proves the acceptance criterion "a real AI call producing a model_calls
// row" (issue #49) against real Postgres — no network mocking needed: with
// no OPENROUTER_API_KEY set (true for local/CI, see .env.example) the call
// itself fails before ever reaching the network, but tracking a
// `call_failed` outcome is exactly as real a model_calls write as tracking
// a success, and this stays fast/offline the same way
// test/unit/ai/effect-ai-sdk.test.ts does.
describe("observability (issue #49)", () => {
  beforeAll(async () => {
    await migrate();
  });

  afterEach(async () => {
    await db.delete(modelCalls);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("recordModelCall writes one row per raw provider call", async () => {
    await Effect.runPromise(
      recordModelCall({
        correlationId: "test-correlation-id",
        pipelineStage: "description_parse",
        model: "openai/gpt-4o-mini",
        outcome: "success",
        latencyMs: 42,
        promptTokens: 10,
        completionTokens: 5,
      }),
    );

    const rows = await db
      .select()
      .from(modelCalls)
      .where(eq(modelCalls.correlationId, "test-correlation-id"));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      pipelineStage: "description_parse",
      model: "openai/gpt-4o-mini",
      outcome: "success",
      latencyMs: 42,
      promptTokens: 10,
      completionTokens: 5,
    });
  });

  it("generateTextEffect writes a model_calls row when called with tracking", async () => {
    const correlationId = "generate-text-tracking";

    await Effect.runPromiseExit(
      generateTextEffect({
        model: "test/model",
        prompt: "hi",
        tracking: { pipelineStage: "description_parse", correlationId },
      }),
    );

    const rows = await db
      .select()
      .from(modelCalls)
      .where(eq(modelCalls.correlationId, correlationId));

    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe("call_failed");
  });

  it("generateTextEffect writes nothing without tracking — eval-harness runs are excluded", async () => {
    await Effect.runPromiseExit(
      generateTextEffect({ model: "test/model", prompt: "hi" }),
    );

    const rows = await db.select().from(modelCalls);
    expect(rows).toHaveLength(0);
  });

  it("checkTripwire doesn't throw against a real (empty) model_calls table", async () => {
    await expect(checkTripwire()).resolves.toBeUndefined();
  });

  it("MODEL_CALLS_TRIPWIRE_THRESHOLD has a sane default", () => {
    expect(env.MODEL_CALLS_TRIPWIRE_THRESHOLD).toBeGreaterThan(0);
  });
});
