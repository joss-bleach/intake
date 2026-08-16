import { Effect } from "effect";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { runEffect } from "../effect-trpc";
import { getDiaryEntryEffect } from "../log-description/log-description";
import {
  createSavedMealEffect,
  relogSavedMealEffect,
  searchSuggestionsEffect,
} from "../saved-meals/saved-meals";

// Ceilings, not user limits — a meal name is a few words and a meal is a
// handful of items. They stop an unbounded string reaching the search scan
// or the shared `saved_meals` row, and cap the per-request item fan-out.
const MAX_SEARCH_QUERY_LENGTH = 200;
const MAX_MEAL_NAME_LENGTH = 200;
const MAX_ITEMS_PER_MEAL = 50;

const searchInput = z.object({
  query: z.string().trim().min(1).max(MAX_SEARCH_QUERY_LENGTH).optional(),
});

const savedMealItemInput = z.object({
  foodId: z.string().uuid(),
  quantity: z.number().positive(),
  quantityUnit: z.enum(["g", "ml", "serving"]),
});

const createInput = z.object({
  name: z.string().trim().min(1).max(MAX_MEAL_NAME_LENGTH),
  items: z.array(savedMealItemInput).min(1).max(MAX_ITEMS_PER_MEAL),
});

const relogInput = z.object({
  savedMealId: z.string().uuid(),
});

// All procedures require a session and are scoped to ctx.user.id (issue
// #90/ADR 0007) — two accounts' saved-meal libraries are fully independent.
export const savedMealsRouter = router({
  // Search over logging history (issue #52): recently-logged foods grouped
  // from `logged_items`, merged with named SavedMeals, both ranked by
  // times-logged/last-logged-at. No `query` returns the full ranked list —
  // the "browse everything" case, not just the "type to search" one.
  search: protectedProcedure.input(searchInput).query(({ ctx, input }) =>
    runEffect(searchSuggestionsEffect(input.query, ctx.user.id)),
  ),

  create: protectedProcedure.input(createInput).mutation(({ ctx, input }) =>
    runEffect(createSavedMealEffect(input, ctx.user.id)),
  ),

  // Re-logs a saved meal's items in one action and returns the resulting
  // diary entry snapshot, same shape logDescription/labelPhoto save return,
  // so the client renders all three the same way.
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
