import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { generateObjectEffect } from "../../src/ai/effect-ai-sdk";
import { env } from "../../src/server/env";

// ADR 0004's open assumption: Effect Schema, converted via
// Schema.standardSchemaV1, plugs straight into generateObject's `schema`
// option with no translation layer. This is the real round-trip that
// confirms it — a trivial prompt, a real OpenRouter call, decoded straight
// into an Effect Schema class. Skipped without OPENROUTER_API_KEY (unset
// locally/CI — see .env.example / ADR 0005): a real key isn't provisioned
// yet, so this only runs where one has been set deliberately.
const TrivialGreeting = Schema.Struct({
  greeting: Schema.String,
});

describe.skipIf(!env.OPENROUTER_API_KEY)("generateObjectEffect (real OpenRouter call)", () => {
  it("round-trips a trivial prompt through an Effect Schema", async () => {
    const result = await Effect.runPromise(
      generateObjectEffect({
        // Any cheap, structured-output-capable model — this test proves
        // Standard Schema compatibility, not a model pick (ADR 0005's
        // actual picks are still TBD, pending the bake-off).
        model: "openai/gpt-4o-mini",
        prompt: 'Reply with a short, friendly one-word greeting, e.g. "hello".',
        schema: TrivialGreeting,
      }),
    );

    expect(result.greeting.length).toBeGreaterThan(0);
  });
}, 30_000);
