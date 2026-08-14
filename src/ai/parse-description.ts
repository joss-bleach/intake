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
const prompt = (description: string) => `You are a nutrition-logging assistant. Parse the following free-text meal description into a list of individual ingredients. Every food or drink mentioned must appear in the output — never drop an item because you don't recognise it.

Splitting rules:
- Split compound descriptions into separate ingredients. "Toast with jam" is two ingredients (bread, jam); "cereal with milk" is two; "chicken salad with dressing" is at least three. Trailing phrases like "with some X on it" always become their own ingredient.
- Do NOT split a branded product into components. "Morrisons cappuccino sachet" is one ingredient (an instant-cappuccino powder), not coffee + milk + sugar.

Brands and retailers:
- Descriptions often include supermarket or brand names (e.g. Morrisons, Tesco, Aldi, M&S, Warburtons, Jason's). A brand name is part of the ingredient's identity — keep it. Set the name to "<Brand> <product>" (e.g. "Jason's sourdough bread", "Morrisons instant cappuccino sachet") and include the brand in the searchTerm.
- If you don't recognise the brand, do not reject or ignore the item. Assume it's a brand of whatever the surrounding words describe, keep the brand in name and searchTerm, estimate nutrition-relevant details from the generic product (e.g. treat unknown-brand sourdough as typical sourdough bread), and set nameConfidence to "needs_review".

Quantities and units:
- Guess a quantity in grams (g), millilitres (ml), or servings ("serving") — whichever the description implies.
- Convert household units to grams/ml using typical values, multiplied by any count given: a slice of bread ≈ 40 g (sourdough slices often ≈ 50 g), an instant-coffee/cappuccino sachet ≈ 15–20 g of powder, a teaspoon ≈ 5 g, a tablespoon ≈ 15 g, a pat of butter ≈ 10 g, "some jam" on bread ≈ 15 g per slice or so. "Two sachets" means 2 × the per-sachet amount.
- A stated count with a known unit (e.g. "two slices") means the count is confident, but the gram conversion is still an estimate — tag such quantities "needs_review".
- Tag a name or quantity "confident" only when the description states it or clearly implies it; use "needs_review" for anything estimated (vague amounts like "a splash" or "a bowl of", or a food whose identity you're guessing).

Clarification:
- If an ingredient's identity is genuinely ambiguous in a way that would meaningfully change its nutrition (e.g. "a latte" — which milk? a cappuccino sachet — made with water or milk?), set nameConfidence to "needs_review" and include 2–4 short clarifyOptions: a "label" for the chip button (e.g. "Oat milk") and a "searchTerm" naming that variant for a food-database search (e.g. "oat milk latte"). Keep brand names in these searchTerms too.
- Only offer clarifyOptions when asking would genuinely help — most ingredients are specific enough already and should have none.

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
