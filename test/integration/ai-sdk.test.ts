import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { generateObjectEffect } from "../../src/ai/effect-ai-sdk";
import { env } from "../../src/server/env";

// ADR 0004's vendor wrapper, real round-trip: an Effect Schema, converted
// to an AI-SDK schema via JSONSchema.make + Schema.decodeUnknownEither (see
// effect-ai-sdk.ts's toGenerateObjectSchema — Schema.standardSchemaV1 alone
// turned out not to plug straight in, discovered running issue #54's
// bake-off), round-trips a trivial prompt through a real OpenRouter call.
// Skipped without OPENROUTER_API_KEY (unset locally/CI — see .env.example /
// ADR 0005): a real key isn't provisioned yet, so this only runs where one
// has been set deliberately.
const TrivialGreeting = Schema.Struct({
  greeting: Schema.String,
});

describe.skipIf(!env.OPENROUTER_API_KEY)("generateObjectEffect (real OpenRouter call)", () => {
  it("round-trips a trivial prompt through an Effect Schema", async () => {
    const result = await Effect.runPromise(
      generateObjectEffect({
        // Any cheap, structured-output-capable model — this test proves
        // the schema round-trip, not a model pick (see ADR 0005 for the
        // actual picks).
        model: "openai/gpt-4o-mini",
        prompt: 'Reply with a short, friendly one-word greeting, e.g. "hello".',
        schema: TrivialGreeting,
      }),
    );

    expect(result.greeting.length).toBeGreaterThan(0);
  });
}, 30_000);
