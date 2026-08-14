import { Effect } from "effect";
import {
  generateObjectWithFallbackEffect,
  type AiSdkError,
} from "../../ai/effect-ai-sdk";
import { ParsedLabelReading } from "../../ai/schemas";
import { NUTRIENT_CODES } from "../food/nutrient-codes";
import { env } from "../env";

const NUTRIENT_CODE_LIST = Object.values(NUTRIENT_CODES).join(", ");

/**
 * Stage 1→2 prompt for the label path (ADR 0001): read a photographed UK
 * nutrition panel and transcribe it, not estimate it. Constrained to the
 * app's fixed nutrient vocabulary (nutrient-codes.ts) so a transcribed
 * label writes into `nutrient_values` under the same codes the food-database
 * paths use, and to the per-100(g|ml) column specifically — that's the
 * printed baseline `foods.basisUnit`/`servingSize` normalize against.
 */
export const buildLabelOcrPrompt = (): string =>
  `You are transcribing a UK back-of-pack nutrition label from a photo. ` +
  `Read the values exactly as printed — this is a transcription task, not ` +
  `an estimate. Never compute, convert, or infer a value the panel doesn't ` +
  `print.\n\n` +
  `Which column to read:\n` +
  `- Use the "per 100g" / "per 100ml" column for every nutrient value, not ` +
  `the per-serving column.\n` +
  `- Some panels print multiple per-100 columns (e.g. "as sold" vs "as ` +
  `prepared", or "with semi-skimmed milk"). Use the "as sold" / dry-product ` +
  `column; if only an "as prepared" column exists, use it and mark every ` +
  `nutrient "needs_review".\n` +
  `- Ignore front-of-pack traffic-light values entirely — they are ` +
  `per-serving.\n\n` +
  `Nutrient rows:\n` +
  `- Use exactly these nutrient codes, one entry per code the panel ` +
  `actually reports (skip codes it doesn't print): ${NUTRIENT_CODE_LIST}.\n` +
  `- Energy is usually printed as both kJ and kcal (e.g. ` +
  `"1046kJ/250kcal") — report the kcal figure for the energy_kcal code.\n` +
  `- "of which saturates" belongs to saturated fat and "of which sugars" ` +
  `to sugars — do not confuse them with the parent fat/carbohydrate rows.\n` +
  `- Transcribe salt as printed under "Salt". If the panel prints sodium ` +
  `instead, do not convert it to salt yourself — report what's printed and ` +
  `mark it "needs_review".\n` +
  `- Values printed as "<0.5" / "trace" / "nil": report as 0 and mark ` +
  `"needs_review".\n` +
  `- Watch for decimal commas ("0,7g") and OCR-style confusions (0/O, ` +
  `1/7, 5/6, 3/8) — if a digit is plausibly either of two readings, pick ` +
  `the more legible one and mark it "needs_review".\n\n` +
  `Product and serving info:\n` +
  `- Report the product name and its brand if printed anywhere on the ` +
  `visible packaging.\n` +
  `- Report whether the panel's basis is g or ml (per 100g vs per 100ml).\n` +
  `- Report the printed serving size if one is given, exactly as printed ` +
  `(e.g. "30g", "125ml").\n` +
  `- If the panel or pack also prints a discrete-unit descriptor for that ` +
  `serving (e.g. "1 slice", "2 biscuits", "1 pouch", "½ pack"), report it ` +
  `too, exactly as printed. This descriptor may appear in the serving-size ` +
  `line itself ("per slice (44g)"), in a footnote, or near the panel — ` +
  `read it from wherever it's printed. If the pack prints only a weight or ` +
  `volume with no countable unit, leave this field empty — do not invent ` +
  `one.\n\n` +
  `Confidence:\n` +
  `- Tag every field's confidence as "confident" or "needs_review". Mark ` +
  `a field "needs_review" whenever glare, a crease, blur, low resolution, ` +
  `an angled shot, or a cut-off edge makes it hard to read — transcribe ` +
  `your best reading but flag it rather than silently guessing.\n` +
  `- If an entire required region (e.g. the per-100g column header) is ` +
  `not visible in the photo, say so rather than reconstructing it.`;

/**
 * OCR extraction for the label-photo logging flow (issue #47): the
 * confirmed photo goes to the vision model as an image part alongside
 * `buildLabelOcrPrompt`'s instructions, validated into `ParsedLabelReading`.
 * Malformed output retries once against the fallback model, then hard-fails
 * (ADR 0001, via `generateObjectWithFallbackEffect`) — this function itself
 * makes no further retry decision.
 *
 * Model roles are env-configured (env.ts), defaulting to ADR 0005's actual
 * bake-off picks (#54) — overridable rather than hardcoded so a future
 * re-run doesn't need a code change.
 */
export const extractLabelReading = (photo: {
  readonly data: string;
  readonly mediaType: string;
}): Effect.Effect<ParsedLabelReading, AiSdkError> =>
  generateObjectWithFallbackEffect({
    model: env.LABEL_VISION_MODEL,
    fallbackModel: env.LABEL_VISION_FALLBACK_MODEL,
    prompt: buildLabelOcrPrompt(),
    images: [photo],
    schema: ParsedLabelReading,
  });
