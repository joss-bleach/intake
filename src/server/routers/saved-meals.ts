import { Effect } from "effect";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../trpc";
import { runEffect } from "../effect-trpc";
import { getDiaryEntryEffect } from "../log-description/log-description";
import {
  createSavedMealEffect,
  relogSavedMealEffect,
  searchSuggestionsEffect,
} from "../saved-meals/saved-meals";

const searchInput = z.object({
  query: z.string().trim().min(1).optional(),
});

const savedMealItemInput = z.object({
  foodId: z.string().uuid(),
  quantity: z.number().positive(),
  quantityUnit: z.enum(["g", "ml", "serving"]),
});

const createInput = z.object({
  name: z.string().trim().min(1),
  items: z.array(savedMealItemInput).min(1),
});

const relogInput = z.object({
  savedMealId: z.string().uuid(),
});

export const savedMealsRouter = router({
  // Search over logging history (issue #52): recently-logged foods grouped
  // from `logged_items`, merged with named SavedMeals, both ranked by
  // times-logged/last-logged-at. No `query` returns the full ranked list —
  // the "browse everything" case, not just the "type to search" one.
  search: publicProcedure.input(searchInput).query(({ input }) =>
    runEffect(searchSuggestionsEffect(input.query)),
  ),

  create: publicProcedure.input(createInput).mutation(({ input }) =>
    runEffect(createSavedMealEffect(input)),
  ),

  // Re-logs a saved meal's items in one action and returns the resulting
  // diary entry snapshot, same shape logDescription/labelPhoto save return,
  // so the client renders all three the same way. Scoped to the caller
  // (#89/ADR 0007) — search/create stay public, diary writes don't.
  relog: protectedProcedure.input(relogInput).mutation(({ ctx, input }) =>
    runEffect(
      Effect.gen(function* () {
        const { diaryEntryId } = yield* relogSavedMealEffect(input.savedMealId, ctx.user.id);
        const snapshot = yield* getDiaryEntryEffect(diaryEntryId, ctx.user.id);
        // The diary entry was just created above in the same request — a
        // miss here means it vanished mid-request, not a normal not-found.
        return snapshot ?? (yield* Effect.die(new Error("Re-logged diary entry not found immediately after creation")));
      }),
    ),
  ),
});
