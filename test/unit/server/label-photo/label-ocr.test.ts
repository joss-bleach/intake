import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import { AiSdkError } from "../../../../src/ai/effect-ai-sdk";
import {
  buildLabelOcrPrompt,
  extractLabelReading,
} from "../../../../src/server/label-photo/label-ocr";
import { NUTRIENT_CODES } from "../../../../src/server/food/nutrient-codes";

const failureValue = (exit: Exit.Exit<unknown, unknown>): unknown => {
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Cause.failureOption(exit.cause);
  return failure._tag === "Some" ? failure.value : undefined;
};

describe("buildLabelOcrPrompt", () => {
  it("names every nutrient code the extraction should use", () => {
    const prompt = buildLabelOcrPrompt();

    for (const code of Object.values(NUTRIENT_CODES)) {
      expect(prompt).toContain(code);
    }
  });

  it("instructs per-field confidence tagging rather than guessing", () => {
    const prompt = buildLabelOcrPrompt();

    expect(prompt).toMatch(/confident/);
    expect(prompt).toMatch(/needs_review/);
  });
});

// Same offline-safe style as test/unit/ai/effect-ai-sdk.test.ts: no
// OPENROUTER_API_KEY set locally/CI means the AI SDK fails at its own auth
// check before any request goes out, so this stays fast while still
// proving extractLabelReading wires a real image call through the shared
// wrapper (not a raw throw).
describe("extractLabelReading", () => {
  it("fails with a tagged AiSdkError, not a raw rejection", async () => {
    const exit = await Effect.runPromiseExit(
      extractLabelReading({ data: "ZmFrZQ==", mediaType: "image/jpeg" }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(failureValue(exit)).toBeInstanceOf(AiSdkError);
  });
});
