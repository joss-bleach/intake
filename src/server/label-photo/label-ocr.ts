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
  `an estimate. Use the "per 100g" / "per 100ml" column, not the per-serving ` +
  `column, for every nutrient value. Report the product name, its brand if ` +
  `printed, whether the panel is in g or ml, and the printed serving size if ` +
  `one is given. Use exactly these nutrient codes, one entry per code the ` +
  `panel actually reports (skip codes it doesn't print): ${NUTRIENT_CODE_LIST}. ` +
  `Tag every field's confidence as "confident" or "needs_review" — mark a ` +
  `field "needs_review" whenever glare, a crease, blur, or a cut-off edge ` +
  `makes it hard to read, rather than guessing at a value.`;

/**
 * OCR extraction for the label-photo logging flow (issue #47): the
 * confirmed photo goes to the vision model as an image part alongside
 * `buildLabelOcrPrompt`'s instructions, validated into `ParsedLabelReading`.
 * Malformed output retries once against the fallback model, then hard-fails
 * (ADR 0001, via `generateObjectWithFallbackEffect`) — this function itself
 * makes no further retry decision.
 *
 * Model roles are env-configured placeholders (env.ts) pending ADR 0005's
 * bake-off (#54), not hardcoded picks.
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
