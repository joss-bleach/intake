import type { Effect } from "effect";
import { env } from "../server/env";
import { type AiSdkError, generateObjectEffect, generateObjectWithFallbackEffect } from "./effect-ai-sdk";
import { ParsedDescription } from "./schemas";

// Stage 1/2 of the description path (ADR 0001, issue #46): turn a free-text
// meal description into ParsedDescription's ingredient/quantity guesses.
// ADR 0005 gives description parsing no separate fallback tier — "its own
// retry re-tries itself" — so both the primary and fallback model passed to
// generateObjectWithFallbackEffect are the same DESCRIPTION_PARSE_MODEL; the
// retry-once-then-hard-fail behaviour (ADR 0001) still comes from that
// wrapper, unchanged.
const prompt = (description: string) => `You are a nutrition-logging assistant. Parse the following free-text meal description into a list of individual ingredients.

For each ingredient, guess a quantity in grams (g), millilitres (ml), or servings ("serving") — whichever the description implies. Tag both the ingredient's name and its quantity as "confident" only when the description states or clearly implies it; use "needs_review" for anything you had to estimate (a vague amount like "a splash" or "a bowl of", or a food you're guessing the identity of).

If an ingredient's identity is genuinely ambiguous in a way that would meaningfully change its nutrition (e.g. "a latte" — which milk?), set its nameConfidence to "needs_review" and include 2-4 short clarifyOptions, each a specific variant the user might mean: a "label" for the chip button (e.g. "Oat milk") and a "searchTerm" naming that variant for a food-database search (e.g. "oat milk latte"). Only offer clarifyOptions when asking would genuinely help — most ingredients are specific enough already and should have none.

Description: "${description}"`;

/**
 * `attempt` is the same test seam generateObjectWithFallbackEffect exposes —
 * defaults to the real call, overridable in tests so parsing can be exercised
 * without a network call or an API key.
 */
export const parseDescriptionEffect = (
  description: string,
  attempt: typeof generateObjectEffect = generateObjectEffect,
): Effect.Effect<ParsedDescription, AiSdkError> =>
  generateObjectWithFallbackEffect(
    {
      model: env.DESCRIPTION_PARSE_MODEL,
      fallbackModel: env.DESCRIPTION_PARSE_MODEL,
      prompt: prompt(description),
      schema: ParsedDescription,
    },
    attempt,
  );
