import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { parseArgs, runEval } from "../../../src/eval/run";

describe("parseArgs", () => {
  it("defaults to running both pipelines, cache-only", () => {
    expect(parseArgs([])).toEqual({
      pipeline: "all",
      refresh: false,
      model: undefined,
      fallbackModel: undefined,
    });
  });

  it("parses a single pipeline and the refresh/model flags", () => {
    expect(
      parseArgs([
        "--pipeline=label",
        "--refresh",
        "--model=openai/gpt-4o-mini",
        "--fallback-model=google/gemini-2.5-pro",
      ]),
    ).toEqual({
      pipeline: "label",
      refresh: true,
      model: "openai/gpt-4o-mini",
      fallbackModel: "google/gemini-2.5-pro",
    });
  });

  it("falls back to 'all' for an unrecognized --pipeline value", () => {
    expect(parseArgs(["--pipeline=bogus"]).pipeline).toBe("all");
  });
});

// Runs against the real committed fixtures and cache (test/fixtures/eval) —
// this is the same invocation `pnpm eval` makes in CI, so a regression here
// is a regression there.
describe("runEval (cache-only, real fixtures)", () => {
  it("scores both pipelines and meets both floors from cache alone", async () => {
    const summary = await Effect.runPromise(
      runEval({ pipeline: "all", refresh: false }),
    );

    expect(summary.description?.meetsFloor).toBe(true);
    expect(summary.label?.meetsFloor).toBe(true);
  });

  it("scores only the requested pipeline", async () => {
    const summary = await Effect.runPromise(
      runEval({ pipeline: "description", refresh: false }),
    );

    expect(summary.description).toBeDefined();
    expect(summary.label).toBeUndefined();
  });
});
