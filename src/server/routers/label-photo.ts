import { Data, Effect, Schema } from "effect";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { runEffect } from "../effect-trpc";
import { extractLabelReading } from "../label-photo/label-ocr";
import { saveLabelPhotoEntry } from "../label-photo/save-label-photo";
import { correctLabelPhotoFood, correctLabelPhotoInstance } from "../label-photo/correct-label-photo";
import { ParsedLabelReading, QuantityUnit } from "../../ai/schemas";

class DbError extends Data.TaggedError("DbError")<{ readonly cause: unknown }> {
  get message() {
    return "Database write failed.";
  }
}

const extractInput = z.object({
  // Base64-encoded image bytes, no "data:" prefix — the client strips that
  // off the FileReader/getUserMedia data URL before sending.
  photoBase64: z.string().min(1),
  mediaType: z.string().min(1),
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
    originalLoggedItemId: Schema.String,
    diaryEntryId: Schema.String,
    foodId: Schema.String,
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
    foodId: Schema.String,
    reading: ParsedLabelReading,
    editedNutrientCodes: Schema.Array(Schema.String),
  }),
);

export const labelPhotoRouter = router({
  // Stage 1→2: OCR the photo into a ParsedLabelReading for the confirm
  // screen. Deliberately skips food-database resolution (issue #44) — see
  // save-label-photo.ts's comment for why.
  extract: publicProcedure.input(extractInput).mutation(({ input }) =>
    runEffect(
      extractLabelReading({ data: input.photoBase64, mediaType: input.mediaType }),
    ),
  ),

  // Confirmed reading + amount -> Food/NutrientValues/DiaryEntry/LoggedItem.
  save: publicProcedure.input(saveInput).mutation(({ ctx, input }) =>
    runEffect(
      Effect.tryPromise({
        try: () =>
          saveLabelPhotoEntry(ctx.db, input.reading, {
            quantity: input.quantity,
            quantityUnit: input.quantityUnit,
          }),
        catch: (cause) => new DbError({ cause }),
      }),
    ),
  ),

  // Instance-level correction ("just this log") — see correct-label-photo.ts.
  correctInstance: publicProcedure.input(correctInstanceInput).mutation(({ ctx, input }) =>
    runEffect(
      Effect.tryPromise({
        try: () =>
          correctLabelPhotoInstance(ctx.db, {
            originalLoggedItemId: input.originalLoggedItemId,
            diaryEntryId: input.diaryEntryId,
            foodId: input.foodId,
            reading: input.reading,
            amount: { quantity: input.quantity, quantityUnit: input.quantityUnit },
            editedNutrientCodes: input.editedNutrientCodes,
          }),
        catch: (cause) => new DbError({ cause }),
      }),
    ),
  ),

  // Food-level correction ("this product, going forward") — see
  // correct-label-photo.ts.
  correctFood: publicProcedure.input(correctFoodInput).mutation(({ ctx, input }) =>
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
