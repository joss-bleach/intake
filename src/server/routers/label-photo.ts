import { Data, Effect, Schema } from "effect";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { runEffect } from "../effect-trpc";
import { extractLabelReading } from "../label-photo/label-ocr";
import { saveLabelPhotoEntry } from "../label-photo/save-label-photo";
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
});
