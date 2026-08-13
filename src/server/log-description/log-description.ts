import { Data, Effect } from "effect";
import { eq, inArray } from "drizzle-orm";
import { parseDescriptionEffect } from "../../ai/parse-description";
import { generateObjectEffect, type AiSdkError } from "../../ai/effect-ai-sdk";
import { db } from "../db";
import { diaryEntries, foods, loggedItems, nutrientValues } from "../db/schema";
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

export interface SavedDiaryEntry {
  readonly id: string;
  readonly loggedAt: string;
}

/**
 * The full description-path pipeline (issue #46, confident-case happy path):
 * Stage 1/2 parse -> Stage 3 resolve each ingredient -> one diary_entries row
 * with one logged_items row per ingredient. needs_review items (an estimated
 * quantity, a total database gap) are saved and flagged, never blocking the
 * save — only a hard-failed Stage 2 parse blocks anything, per ADR 0001.
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

    // Resolving one ingredient can write a new `foods` row (a live OFF hit, an
    // LLM-estimate fallback) — sequential rather than concurrent so two
    // ingredients in the same description that resolve to the same new food
    // name can't race each other into duplicate rows.
    const resolvedItems = yield* Effect.forEach(
      parsed.ingredients,
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

export interface DiaryEntryItem {
  readonly id: string;
  readonly foodName: string;
  readonly quantity: number;
  readonly quantityUnit: "g" | "ml" | "serving";
  readonly confidence: "confident" | "needs_review" | null;
  // Stage 3's source vocabulary (ADR 0001), not the raw foods.provenance —
  // "off"/"cofid" both collapse to "database" here, since a diary entry only
  // cares that the number came from a real dataset, not which one.
  readonly source: "database" | "llm_estimate_fallback";
  readonly nutrition: ReadonlyArray<{
    readonly code: string;
    readonly value: number;
    readonly unit: string;
  }>;
}

const toStage3Source = (
  provenance: "off" | "cofid" | "llm_estimate_fallback" | "label_extraction",
): "database" | "llm_estimate_fallback" =>
  provenance === "llm_estimate_fallback" ? "llm_estimate_fallback" : "database";

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
 */
export const getDiaryEntryEffect = (
  id: string,
): Effect.Effect<DiaryEntrySnapshot | null> =>
  Effect.gen(function* () {
    const [diaryEntry] = yield* Effect.tryPromise(() =>
      db.select().from(diaryEntries).where(eq(diaryEntries.id, id)),
    ).pipe(Effect.orDie);
    if (!diaryEntry) return null;

    const rows = yield* Effect.tryPromise(() =>
      db
        .select({ item: loggedItems, food: foods })
        .from(loggedItems)
        .innerJoin(foods, eq(loggedItems.foodId, foods.id))
        .where(eq(loggedItems.diaryEntryId, id)),
    ).pipe(Effect.orDie);

    const itemIds = rows.map((row) => row.item.id);

    // An instance-level correction is additive (ADR 0001) — it inserts a new
    // logged item and leaves the original in place for the audit trail. Both
    // rows come back from the query above, so the superseded ones are dropped
    // here: a diary entry shows what the user last said, counted once. The
    // lookup isn't scoped to this entry because a correction is allowed to
    // sit in a different one (see logged_items.correctedFromId).
    const supersededRows = itemIds.length
      ? yield* Effect.tryPromise(() =>
          db
            .select({ correctedFromId: loggedItems.correctedFromId })
            .from(loggedItems)
            .where(inArray(loggedItems.correctedFromId, itemIds)),
        ).pipe(Effect.orDie)
      : [];
    const superseded = new Set(supersededRows.map((row) => row.correctedFromId));
    const currentRows = rows.filter((row) => !superseded.has(row.item.id));

    const foodIds = currentRows.map((row) => row.food.id);
    const foodNutrients = foodIds.length
      ? yield* Effect.tryPromise(() =>
          db.select().from(nutrientValues).where(inArray(nutrientValues.foodId, foodIds)),
        ).pipe(Effect.orDie)
      : [];

    // Nutrients attached to a logged item are that log's own corrected
    // values and override the shared food's — nutrient_values' exactly-one-
    // parent rule means an item either has a complete own set or none.
    const currentItemIds = currentRows.map((row) => row.item.id);
    const itemNutrients = currentItemIds.length
      ? yield* Effect.tryPromise(() =>
          db
            .select()
            .from(nutrientValues)
            .where(inArray(nutrientValues.loggedItemId, currentItemIds)),
        ).pipe(Effect.orDie)
      : [];

    return {
      id: diaryEntry.id,
      loggedAt: diaryEntry.loggedAt.toISOString(),
      entryMethod: diaryEntry.entryMethod,
      items: currentRows.map((row) => {
        const own = itemNutrients.filter((nutrient) => nutrient.loggedItemId === row.item.id);
        const nutrition = own.length
          ? own
          : foodNutrients.filter((nutrient) => nutrient.foodId === row.food.id);
        return {
          id: row.item.id,
          foodName: row.food.name,
          quantity: Number(row.item.quantity),
          quantityUnit: row.item.quantityUnit,
          confidence: row.item.confidence,
          source: toStage3Source(row.food.provenance),
          nutrition: nutrition.map((nutrient) => ({
            code: nutrient.code,
            value: Number(nutrient.value),
            unit: nutrient.unit,
          })),
        };
      }),
    };
  });
