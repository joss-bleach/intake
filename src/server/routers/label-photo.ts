import { Data, Effect, Schema } from "effect";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { runEffect } from "../effect-trpc";
import { consumeModelCallBudget } from "../model-call-rate-limiter";
import { extractLabelReading } from "../label-photo/label-ocr";
import { saveLabelPhotoEntry } from "../label-photo/save-label-photo";
import { correctLabelPhotoFood, correctLabelPhotoInstance } from "../label-photo/correct-label-photo";
import { ParsedLabelReading, QuantityUnit } from "../../ai/schemas";
import { SUPPORTED_IMAGE_MEDIA_TYPES } from "../../ai/image-media-types";

class DbError extends Data.TaggedError("DbError")<{ readonly cause: unknown }> {
  get message() {
    return "Database write failed.";
  }
}

// ~10 MiB of base64, so roughly a 7.5 MB image — comfortably above a phone
// camera JPEG, while still bounding what one request can push through the
// vision model. The client sends the file as-is (no downscale), so this is
// the only ceiling.
const MAX_PHOTO_BASE64_LENGTH = 10 * 1024 * 1024;

const extractInput = z.object({
  // Base64-encoded image bytes, no "data:" prefix — the client strips that
  // off the FileReader/getUserMedia data URL before sending.
  photoBase64: z.string().min(1).max(MAX_PHOTO_BASE64_LENGTH),
  mediaType: z.enum(SUPPORTED_IMAGE_MEDIA_TYPES),
});

// Reuses the Stage 2 Effect Schema directly as the save mutation's input
// validator (tRPC v11 accepts any Standard Schema) rather than
// hand-duplicating ParsedLabelReading's shape in zod — one schema owns
// what a valid label reading looks like, on both the extract and save
// sides.
const saveInput = Schema.standardSchemaV1(
  Schema.Struct({
    reading: ParsedLabelReading,
    quantity: Schema.Positive,
    quantityUnit: QuantityUnit,
  }),
);

// Corrections (issue #51) reuse the same reading/amount shape as save — a
// correction is the same Stage 2 data, just written to a different place.
const correctInstanceInput = Schema.standardSchemaV1(
  Schema.Struct({
    // The diary entry and food are read off this row server-side rather
    // than taken from the client — see correct-label-photo.ts.
    originalLoggedItemId: Schema.UUID,
    reading: ParsedLabelReading,
    quantity: Schema.Positive,
    quantityUnit: QuantityUnit,
    // Which nutrient codes the user actually edited — see
    // correct-label-photo.ts for why an untouched field can't just inherit
    // "user_corrected"/"confident" from riding along in the same reading.
    editedNutrientCodes: Schema.Array(Schema.String),
  }),
);

const correctFoodInput = Schema.standardSchemaV1(
  Schema.Struct({
    foodId: Schema.UUID,
    reading: ParsedLabelReading,
    editedNutrientCodes: Schema.Array(Schema.String),
  }),
);

export const labelPhotoRouter = router({
  // Stage 1→2: OCR the photo into a ParsedLabelReading for the confirm
  // screen. Deliberately skips food-database resolution (issue #44) — see
  // save-label-photo.ts's comment for why.
  // Rate-limited per account before the model is called (not after): this is
  // one of the two endpoints that spends money on our OpenRouter key, so the
  // check has to gate the spend, not report on it.
  extract: protectedProcedure.input(extractInput).mutation(({ ctx, input }) =>
    runEffect(
      Effect.gen(function* () {
        yield* consumeModelCallBudget(ctx.user.id);
        return yield* extractLabelReading({
          data: input.photoBase64,
          mediaType: input.mediaType,
        });
      }),
    ),
  ),

  // Confirmed reading + amount -> Food/NutrientValues/DiaryEntry/LoggedItem.
  save: protectedProcedure.input(saveInput).mutation(({ ctx, input }) =>
    runEffect(
      Effect.tryPromise({
        try: () =>
          saveLabelPhotoEntry(
            ctx.db,
            input.reading,
            { quantity: input.quantity, quantityUnit: input.quantityUnit },
            ctx.user.id,
          ),
        catch: (cause) => new DbError({ cause }),
      }),
    ),
  ),

  // Instance-level correction ("just this log") — see correct-label-photo.ts.
  correctInstance: protectedProcedure.input(correctInstanceInput).mutation(({ ctx, input }) =>
    runEffect(
      Effect.tryPromise({
        try: () =>
          correctLabelPhotoInstance(
            ctx.db,
            {
              originalLoggedItemId: input.originalLoggedItemId,
              reading: input.reading,
              amount: { quantity: input.quantity, quantityUnit: input.quantityUnit },
              editedNutrientCodes: input.editedNutrientCodes,
            },
            ctx.user.id,
          ),
        catch: (cause) => new DbError({ cause }),
      }),
    ),
  ),

  // Food-level correction ("this product, going forward") — see
  // correct-label-photo.ts.
  correctFood: protectedProcedure.input(correctFoodInput).mutation(({ ctx, input }) =>
    runEffect(
      Effect.tryPromise({
        try: () =>
          correctLabelPhotoFood(ctx.db, {
            foodId: input.foodId,
            reading: input.reading,
            editedNutrientCodes: input.editedNutrientCodes,
          }),
        catch: (cause) => new DbError({ cause }),
      }),
    ),
  ),
});
