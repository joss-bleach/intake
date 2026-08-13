import { Data, Effect } from "effect";
import { eq, inArray, sql } from "drizzle-orm";
import { parseDescriptionEffect } from "../../ai/parse-description";
import { generateObjectEffect, type AiSdkError } from "../../ai/effect-ai-sdk";
import { ClarifiedIngredient, ParsedIngredient, type QuantityUnit } from "../../ai/schemas";
import { db } from "../db";
import { diaryEntries, foods, loggedItems, nutrientValues } from "../db/schema";
import { NUTRIENT_UNITS, type NutrientCode } from "../food/nutrient-codes";
import type { FoodLookupRateLimiter } from "../food/rate-limiter";
import type { OffLiveClient } from "../food/off-client";
import { resolveIngredientEffect } from "./resolve-ingredient";

// Stage 2's hard-failure case (ADR 0001): a malformed parse survives
// generateObjectWithFallbackEffect's own retry-once, so nothing here is
// trusted — mapped to its own tagged error (rather than passing the raw
// AiSdkError through) so the tRPC layer can give it a specific, user-facing
// code instead of a generic 500.
export class DescriptionParseFailedError extends Data.TaggedError(
  "DescriptionParseFailedError",
)<{
  readonly description: string;
  readonly cause: AiSdkError;
}> {
  readonly code = "UNPROCESSABLE_CONTENT" as const;

  get message() {
    return "Couldn't understand that description. Try rephrasing it.";
  }
}

export class LoggedItemNotFoundError extends Data.TaggedError(
  "LoggedItemNotFoundError",
)<{
  readonly loggedItemId: string;
}> {
  readonly code = "NOT_FOUND" as const;

  get message() {
    return "That logged item no longer exists.";
  }
}

export interface SavedDiaryEntry {
  readonly id: string;
  readonly loggedAt: string;
}

/**
 * Stage 3 + save, shared by the single-call happy path (#46) and #50's
 * clarify-then-confirm path: resolve each already-parsed ingredient against
 * the food database, then write one diary_entries row and one logged_items
 * row per ingredient in a single transaction. needs_review items (an
 * estimated quantity, a total database gap, an unresolved ambiguity) are
 * saved and flagged, never blocking the save — only a hard-failed Stage 2
 * parse blocks anything, and that happens before this function is ever
 * called.
 */
export const saveResolvedIngredientsEffect = (
  ingredients: ReadonlyArray<ParsedIngredient>,
  estimateAttempt: typeof generateObjectEffect = generateObjectEffect,
): Effect.Effect<SavedDiaryEntry, never, FoodLookupRateLimiter | OffLiveClient> =>
  Effect.gen(function* () {
    // Resolving one ingredient can write a new `foods` row (a live OFF hit, an
    // LLM-estimate fallback) — sequential rather than concurrent so two
    // ingredients in the same description that resolve to the same new food
    // name can't race each other into duplicate rows.
    const resolvedItems = yield* Effect.forEach(
      ingredients,
      (ingredient) =>
        resolveIngredientEffect(ingredient, estimateAttempt).pipe(
          // A resolution-time AiSdkError (the LLM-estimate fallback's own call
          // failing) is an infra defect here, not a re-triable parse failure —
          // ADR 0001's hard-fail-closed policy is specific to Stage 2.
          Effect.orDie,
        ),
      { concurrency: 1 },
    );

    const [savedEntry] = yield* Effect.tryPromise(() =>
      db.transaction(async (tx) => {
        const [diaryEntry] = await tx
          .insert(diaryEntries)
          .values({ entryMethod: "description" })
          .returning();

        await tx.insert(loggedItems).values(
          resolvedItems.map((item) => ({
            diaryEntryId: diaryEntry.id,
            foodId: item.foodId,
            quantity: String(item.quantity),
            quantityUnit: item.quantityUnit,
            confidence: item.confidence,
          })),
        );

        return [diaryEntry];
      }),
    ).pipe(Effect.orDie);

    return {
      id: savedEntry.id,
      loggedAt: savedEntry.loggedAt.toISOString(),
    };
  });

/**
 * The full description-path pipeline (issue #46, confident-case happy path):
 * Stage 1/2 parse -> saveResolvedIngredientsEffect. No clarification answers
 * — an ambiguous ingredient just resolves to resolveFood's first match,
 * flagged needs_review same as any other estimate. #50's clarify-up-front
 * flow instead calls parseDescriptionEffect and saveResolvedIngredientsEffect
 * separately (see routers/log-description.ts's `parse`/`confirm`), so the
 * user can answer a clarifying chip in between.
 */
// `parseAttempt`/`estimateAttempt` are the same generateObjectEffect DI seam
// used throughout src/ai — default to the real call, overridable in tests so
// the whole pipeline can be exercised without a network call or an API key.
export const logDescriptionEffect = (
  description: string,
  parseAttempt: typeof generateObjectEffect = generateObjectEffect,
  estimateAttempt: typeof generateObjectEffect = generateObjectEffect,
): Effect.Effect<
  SavedDiaryEntry,
  DescriptionParseFailedError,
  FoodLookupRateLimiter | OffLiveClient
> =>
  Effect.gen(function* () {
    const parsed = yield* parseDescriptionEffect(description, parseAttempt).pipe(
      Effect.mapError((cause) => new DescriptionParseFailedError({ description, cause })),
    );

    return yield* saveResolvedIngredientsEffect(parsed.ingredients, estimateAttempt);
  });

// A clarification answer (a chip's searchTerm, or "Something else…" free
// text) resolves identity ambiguity, not quantity — swaps the ingredient's
// name for the answer and marks it confident, but leaves quantity/
// quantityConfidence exactly as Stage 2 (or the user's own inline edit,
// applied client-side before this is ever called) left them. No answer
// given (skipped, or never ambiguous) passes the ingredient through as-is —
// resolveIngredientEffect's own first-match behaviour handles that case
// exactly like the non-clarifying happy path.
const applyClarification = (ingredient: ClarifiedIngredient): ParsedIngredient =>
  ingredient.clarificationSearchTerm
    ? new ParsedIngredient({
        name: ingredient.clarificationSearchTerm,
        nameConfidence: "confident",
        quantity: ingredient.quantity,
        quantityUnit: ingredient.quantityUnit,
        quantityConfidence: ingredient.quantityConfidence,
      })
    : ingredient;

/**
 * #50's clarify-then-confirm path: the client already has Stage 2's
 * ParsedIngredient array (from a prior `parse` call) plus whatever
 * clarification answers and inline quantity edits it collected — this is
 * Stage 3 + save over that, no re-parsing.
 */
export const confirmDescriptionEffect = (
  ingredients: ReadonlyArray<ClarifiedIngredient>,
  estimateAttempt: typeof generateObjectEffect = generateObjectEffect,
): Effect.Effect<SavedDiaryEntry, never, FoodLookupRateLimiter | OffLiveClient> =>
  saveResolvedIngredientsEffect(ingredients.map(applyClarification), estimateAttempt);

// Either an already-known food (a clarify chip's candidate, a "Something
// else…" search result the user picked) or free text to resolve fresh
// (typed into "Something else…" with no result picked, or a food swap on an
// existing logged item) — correctLoggedItemEffect's two ways to answer "what
// food is this really".
export type CorrectionResolution =
  | { readonly kind: "food"; readonly foodId: string }
  | { readonly kind: "search"; readonly searchTerm: string };

/**
 * Instance-level correction (issue #50): additive, never an in-place edit.
 * Writes a *new* logged_items row — same diary_entry_id as the original (a
 * correction is still the same logged occasion, just an edited value), with
 * correctedFromId pointing back at it — and leaves the original row
 * untouched for audit (src/eval/corrections-queue.ts's manual-review queue
 * reads exactly this trail). getDiaryEntryEffect excludes the superseded
 * original from what it returns, so a corrected item is never double-counted.
 *
 * `resolution: "search"` reuses resolveIngredientEffect itself — the same
 * database-search-then-LLM-estimate-fallback Stage 3 already does, so a
 * free-text correction that matches nothing still lands as a flagged
 * needs_review estimate rather than a dead end, with no separate resolution
 * logic to keep in sync.
 */
export const correctLoggedItemEffect = (
  loggedItemId: string,
  resolution: CorrectionResolution,
  quantity: number,
  quantityUnit: QuantityUnit,
  estimateAttempt: typeof generateObjectEffect = generateObjectEffect,
): Effect.Effect<
  { readonly diaryEntryId: string },
  LoggedItemNotFoundError,
  FoodLookupRateLimiter | OffLiveClient
> =>
  Effect.gen(function* () {
    const [original] = yield* Effect.tryPromise(() =>
      db.select().from(loggedItems).where(eq(loggedItems.id, loggedItemId)),
    ).pipe(Effect.orDie);
    if (!original) {
      return yield* Effect.fail(new LoggedItemNotFoundError({ loggedItemId }));
    }

    let foodId: string;
    let confidence: "confident" | "needs_review";
    if (resolution.kind === "food") {
      // A user picking a specific food is exactly what "confident" means —
      // there's no ambiguity or estimate left to flag.
      foodId = resolution.foodId;
      confidence = "confident";
    } else {
      const synthetic = new ParsedIngredient({
        name: resolution.searchTerm,
        nameConfidence: "confident",
        quantity,
        quantityUnit,
        quantityConfidence: "confident",
      });
      const resolved = yield* resolveIngredientEffect(synthetic, estimateAttempt).pipe(
        Effect.orDie,
      );
      foodId = resolved.foodId;
      confidence = resolved.confidence;
    }

    yield* Effect.tryPromise(() =>
      db.insert(loggedItems).values({
        diaryEntryId: original.diaryEntryId,
        foodId,
        quantity: String(quantity),
        quantityUnit,
        confidence,
        correctedFromId: original.id,
      }),
    ).pipe(Effect.orDie);

    return { diaryEntryId: original.diaryEntryId };
  });

export interface CorrectFoodNutrient {
  readonly code: NutrientCode;
  readonly value: number;
}

/**
 * Food-level correction (issue #50): edits the `foods` row's nutrient_values
 * directly rather than writing a logged_items-level record, so it applies to
 * every future log of this food (as well as every already-logged instance
 * that reads its nutrition live, e.g. getDiaryEntryEffect below) — not just
 * the one instance being viewed. There is no separate corrections table for
 * this (schema.ts's comment on loggedItems.correctedFromId): the `foods` row
 * itself is the correction, and `provenance: "user_corrected"` on its
 * nutrient_values rows is the audit trail.
 */
export const correctFoodNutrientsEffect = (
  foodId: string,
  nutrients: ReadonlyArray<CorrectFoodNutrient>,
): Effect.Effect<void> =>
  Effect.tryPromise(() =>
    db.transaction(async (tx) => {
      for (const nutrient of nutrients) {
        await tx
          .insert(nutrientValues)
          .values({
            foodId,
            code: nutrient.code,
            value: String(nutrient.value),
            unit: NUTRIENT_UNITS[nutrient.code],
            provenance: "user_corrected",
            confidence: "confident",
          })
          .onConflictDoUpdate({
            target: [nutrientValues.foodId, nutrientValues.code],
            targetWhere: sql`${nutrientValues.foodId} is not null`,
            set: {
              value: sql`excluded.value`,
              provenance: "user_corrected",
              confidence: "confident",
            },
          });
      }
    }),
  ).pipe(Effect.orDie);

export interface DiaryEntryItem {
  readonly id: string;
  readonly foodId: string;
  readonly foodName: string;
  readonly quantity: number;
  readonly quantityUnit: "g" | "ml" | "serving";
  readonly confidence: "confident" | "needs_review" | null;
  // Stage 3's source vocabulary (ADR 0001), not the raw foods.provenance —
  // "off"/"cofid" both collapse to "database" here, since a diary entry only
  // cares that the number came from a real dataset, not which one.
  // "user_corrected" is instance-level (this row is itself a correction),
  // distinct from a food-level correction, which stays "database"/
  // "llm_estimate_fallback" — the food's own provenance never changes, only
  // its nutrient_values' provenance does (see correctFoodNutrientsEffect).
  readonly source: "database" | "llm_estimate_fallback" | "user_corrected";
  readonly nutrition: ReadonlyArray<{
    readonly code: string;
    readonly value: number;
    readonly unit: string;
  }>;
}

const toStage3Source = (
  item: { readonly correctedFromId: string | null },
  provenance: "off" | "cofid" | "llm_estimate_fallback" | "label_extraction",
): "database" | "llm_estimate_fallback" | "user_corrected" => {
  if (item.correctedFromId) return "user_corrected";
  return provenance === "llm_estimate_fallback" ? "llm_estimate_fallback" : "database";
};

export interface DiaryEntrySnapshot {
  readonly id: string;
  readonly loggedAt: string;
  readonly entryMethod: "description" | "label_photo" | "saved_meal";
  readonly items: ReadonlyArray<DiaryEntryItem>;
}

/**
 * Reads back a saved diary entry with its ingredients and each ingredient's
 * food-level nutrition — proves the pipeline's output is actually queryable
 * (issue #46's end-to-end acceptance criterion), and is what a future
 * dashboard/log-history screen builds on. Plain joins rather than Drizzle's
 * relational `with:` API, matching resolveFood's own style (schema.ts
 * doesn't export `relations()`).
 *
 * Excludes superseded logged_items — any row another row's correctedFromId
 * points at (issue #50): the original a correction was made *from* stays in
 * the table for audit (src/eval/corrections-queue.ts reads it), but is never
 * part of what a diary entry currently totals, or it would double-count
 * alongside its correction.
 */
export const getDiaryEntryEffect = (
  id: string,
): Effect.Effect<DiaryEntrySnapshot | null> =>
  Effect.gen(function* () {
    const [diaryEntry] = yield* Effect.tryPromise(() =>
      db.select().from(diaryEntries).where(eq(diaryEntries.id, id)),
    ).pipe(Effect.orDie);
    if (!diaryEntry) return null;

    const allRows = yield* Effect.tryPromise(() =>
      db
        .select({ item: loggedItems, food: foods })
        .from(loggedItems)
        .innerJoin(foods, eq(loggedItems.foodId, foods.id))
        .where(eq(loggedItems.diaryEntryId, id)),
    ).pipe(Effect.orDie);

    const supersededIds = new Set(
      allRows
        .map((row) => row.item.correctedFromId)
        .filter((correctedFromId): correctedFromId is string => correctedFromId !== null),
    );
    const rows = allRows.filter((row) => !supersededIds.has(row.item.id));

    const foodIds = rows.map((row) => row.food.id);
    const nutrients = foodIds.length
      ? yield* Effect.tryPromise(() =>
          db.select().from(nutrientValues).where(inArray(nutrientValues.foodId, foodIds)),
        ).pipe(Effect.orDie)
      : [];

    return {
      id: diaryEntry.id,
      loggedAt: diaryEntry.loggedAt.toISOString(),
      entryMethod: diaryEntry.entryMethod,
      items: rows.map((row) => ({
        id: row.item.id,
        foodId: row.food.id,
        foodName: row.food.name,
        quantity: Number(row.item.quantity),
        quantityUnit: row.item.quantityUnit,
        confidence: row.item.confidence,
        source: toStage3Source(row.item, row.food.provenance),
        nutrition: nutrients
          .filter((nutrient) => nutrient.foodId === row.food.id)
          .map((nutrient) => ({
            code: nutrient.code,
            value: Number(nutrient.value),
            unit: nutrient.unit,
          })),
      })),
    };
  });
