import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { Effect, Layer, Schema } from "effect";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../../src/server/db";
import { ClarifiedIngredient } from "../../src/ai/schemas";
import {
  diaryEntries,
  foods,
  foodLookupRateLimitWindows,
  loggedItems,
  nutrientValues,
  user,
} from "../../src/server/db/schema";
import { migrate } from "../../src/server/db/migrate";
import { ingestCofidCsv } from "../../src/server/food/cofid-ingest";
import { ingestOffDump } from "../../src/server/food/off-ingest";
import { OffLiveClient } from "../../src/server/food/off-client";
import { FoodLookupRateLimiter } from "../../src/server/food/rate-limiter";
import { AiSdkError } from "../../src/ai/effect-ai-sdk";
import { NUTRIENT_CODES } from "../../src/server/food/nutrient-codes";
import { listCorrectionsForReview } from "../../src/eval/corrections-queue";
import {
  confirmDescriptionEffect,
  correctFoodNutrientsEffect,
  correctLoggedItemEffect,
  getDiaryEntryEffect,
  LoggedItemNotFoundError,
} from "../../src/server/log-description/log-description";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures",
);

const fakeAttempt =
  (byPrompt: (prompt: string) => unknown) =>
  <A, I>(call: { readonly prompt: string; readonly schema: Schema.Schema<A, I> }): Effect.Effect<A, AiSdkError> =>
    Schema.decodeUnknown(call.schema)(byPrompt(call.prompt)).pipe(
      Effect.mapError(
        (cause) => new AiSdkError({ message: "test fixture decode failed", cause, reason: "parse_failure" }),
      ),
    );

const estimateNutrition = (estimate: {
  energyKcal: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
}) => fakeAttempt(() => estimate);

const runWithFoodLayers = <A, E>(effect: Effect.Effect<A, E, FoodLookupRateLimiter | OffLiveClient>) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(FoodLookupRateLimiter.Default),
      Effect.provide(Layer.succeed(OffLiveClient, { _tag: "OffLiveClient", search: () => Effect.succeed([]) })),
    ),
  );

let userId: string;

describe("issue #50: clarify-up-front confirm + corrections", () => {
  beforeAll(async () => {
    await migrate();
    await ingestOffDump(path.join(fixturesDir, "off-sample.jsonl"));
    await ingestCofidCsv(path.join(fixturesDir, "cofid-sample.csv"));
    const [row] = await db
      .insert(user)
      .values({ id: crypto.randomUUID(), name: "Test User", email: "log-description-corrections@example.com" })
      .returning();
    userId = row.id;
  });

  afterEach(async () => {
    await db.delete(loggedItems);
    await db.delete(diaryEntries);
    await db.delete(foodLookupRateLimitWindows);
    await db.delete(nutrientValues);
    await db.delete(foods);
    await ingestOffDump(path.join(fixturesDir, "off-sample.jsonl"));
    await ingestCofidCsv(path.join(fixturesDir, "cofid-sample.csv"));
  });

  afterAll(async () => {
    await db.delete(nutrientValues);
    await db.delete(foods);
    await db.delete(user);
    await pool.end();
  });

  describe("confirmDescriptionEffect", () => {
    it("a clarification answer resolves to the matching food, confidently", async () => {
      const exit = await runWithFoodLayers(
        confirmDescriptionEffect(
          [
            new ClarifiedIngredient({
              name: "Latte",
              nameConfidence: "needs_review",
              quantity: 350,
              quantityUnit: "ml",
              quantityConfidence: "confident",
              clarificationSearchTerm: "Weetabix",
            }),
          ],
          userId,
        ),
      );

      expect(exit._tag).toBe("Success");
      if (exit._tag !== "Success") throw new Error("unreachable");

      const snapshot = await Effect.runPromise(getDiaryEntryEffect(exit.value.id, userId));
      expect(snapshot?.items[0]?.foodName).toBe("Weetabix Original");
      expect(snapshot?.items[0]?.confidence).toBe("confident");
    });

    it("a free-text clarification with no database match degrades to the LLM-estimate fallback, flagged needs_review", async () => {
      const exit = await runWithFoodLayers(
        confirmDescriptionEffect(
          [
            new ClarifiedIngredient({
              name: "Latte",
              nameConfidence: "needs_review",
              quantity: 350,
              quantityUnit: "ml",
              quantityConfidence: "confident",
              clarificationSearchTerm: "soy milk latte from a place that does not exist",
            }),
          ],
          userId,
          estimateNutrition({ energyKcal: 180, proteinG: 6, carbohydrateG: 17, fatG: 8 }),
        ),
      );

      expect(exit._tag).toBe("Success");
      if (exit._tag !== "Success") throw new Error("unreachable");

      const snapshot = await Effect.runPromise(getDiaryEntryEffect(exit.value.id, userId));
      expect(snapshot?.items[0]?.source).toBe("llm_estimate_fallback");
      expect(snapshot?.items[0]?.confidence).toBe("needs_review");
    });

    it("no clarification answer just resolves against the plain ingredient name, same as the non-ambiguous happy path", async () => {
      const exit = await runWithFoodLayers(
        confirmDescriptionEffect(
          [
            new ClarifiedIngredient({
              name: "Banana",
              nameConfidence: "confident",
              quantity: 100,
              quantityUnit: "g",
              quantityConfidence: "confident",
            }),
          ],
          userId,
        ),
      );

      expect(exit._tag).toBe("Success");
      if (exit._tag !== "Success") throw new Error("unreachable");
      const snapshot = await Effect.runPromise(getDiaryEntryEffect(exit.value.id, userId));
      expect(snapshot?.items[0]?.foodName).toBe("Banana, raw");
    });
  });

  describe("correctLoggedItemEffect (instance-level correction)", () => {
    it("is additive: writes a new row, excludes the superseded original from the diary entry, and keeps it for audit", async () => {
      const exit = await runWithFoodLayers(
        confirmDescriptionEffect(
          [
            new ClarifiedIngredient({ name: "Cheddar Cheese", nameConfidence: "confident", quantity: 20, quantityUnit: "g", quantityConfidence: "confident" }),
          ],
          userId,
        ),
      );
      expect(exit._tag).toBe("Success");
      if (exit._tag !== "Success") throw new Error("unreachable");
      const diaryEntryId = exit.value.id;

      const before = await Effect.runPromise(getDiaryEntryEffect(diaryEntryId, userId));
      const originalItemId = before?.items[0]?.id;
      expect(before?.items).toHaveLength(1);

      const correctExit = await runWithFoodLayers(
        correctLoggedItemEffect(
          originalItemId!,
          { kind: "search", searchTerm: "Weetabix" },
          40,
          "g",
          userId,
        ),
      );
      expect(correctExit._tag).toBe("Success");

      const after = await Effect.runPromise(getDiaryEntryEffect(diaryEntryId, userId));
      expect(after?.items).toHaveLength(1);
      expect(after?.items[0]?.foodName).toBe("Weetabix Original");
      expect(after?.items[0]?.source).toBe("user_corrected");
      expect(after?.items[0]?.confidence).toBe("confident");
      expect(after?.items[0]?.id).not.toBe(originalItemId);

      // Original still exists in the table (audit trail), just superseded.
      const originalRow = await db.select().from(loggedItems).where(eq(loggedItems.id, originalItemId!));
      expect(originalRow).toHaveLength(1);

      // The manual-review queue (issue #48) sees this correction.
      const queue = await listCorrectionsForReview();
      expect(queue.some((c) => c.originalItemId === originalItemId)).toBe(true);
    });

    it("picking an already-known food (kind: 'food') is confident, no re-resolution", async () => {
      const exit = await runWithFoodLayers(
        confirmDescriptionEffect(
          [
            new ClarifiedIngredient({ name: "Cheddar Cheese", nameConfidence: "confident", quantity: 20, quantityUnit: "g", quantityConfidence: "confident" }),
          ],
          userId,
        ),
      );
      if (exit._tag !== "Success") throw new Error("unreachable");
      const before = await Effect.runPromise(getDiaryEntryEffect(exit.value.id, userId));
      const originalItemId = before?.items[0]?.id;

      const [weetabix] = await db.select().from(foods).where(eq(foods.name, "Weetabix Original"));

      const correctExit = await runWithFoodLayers(
        correctLoggedItemEffect(originalItemId!, { kind: "food", foodId: weetabix!.id }, 50, "g", userId),
      );
      expect(correctExit._tag).toBe("Success");

      const after = await Effect.runPromise(getDiaryEntryEffect(exit.value.id, userId));
      expect(after?.items[0]?.foodName).toBe("Weetabix Original");
      expect(after?.items[0]?.quantity).toBe(50);
    });

    it("fails as not-found when correcting a logged item owned by a different user (#89)", async () => {
      const exit = await runWithFoodLayers(
        confirmDescriptionEffect(
          [
            new ClarifiedIngredient({ name: "Cheddar Cheese", nameConfidence: "confident", quantity: 20, quantityUnit: "g", quantityConfidence: "confident" }),
          ],
          userId,
        ),
      );
      expect(exit._tag).toBe("Success");
      if (exit._tag !== "Success") throw new Error("unreachable");
      const diaryEntryId = exit.value.id;

      const before = await Effect.runPromise(getDiaryEntryEffect(diaryEntryId, userId));
      const originalItemId = before?.items[0]?.id;
      const originalFoodId = before?.items[0]?.foodId;

      const [otherUserRow] = await db
        .insert(user)
        .values({ id: crypto.randomUUID(), name: "Other User", email: "log-description-corrections-other@example.com" })
        .returning();
      const otherUserId = otherUserRow.id;

      const correctExit = await runWithFoodLayers(
        correctLoggedItemEffect(originalItemId!, { kind: "food", foodId: originalFoodId! }, 40, "g", otherUserId),
      );
      expect(correctExit._tag).toBe("Failure");
      const failure = correctExit._tag === "Failure" && correctExit.cause._tag === "Fail" ? correctExit.cause.error : null;
      expect(failure).toBeInstanceOf(LoggedItemNotFoundError);

      const otherView = await Effect.runPromise(getDiaryEntryEffect(diaryEntryId, otherUserId));
      expect(otherView).toBeNull();

      await db.delete(user).where(eq(user.id, otherUserId));
    });
  });

  describe("correctFoodNutrientsEffect (food-level correction)", () => {
    it("updates the food's nutrient_values, applying to every read of that food going forward", async () => {
      const [banana] = await db.select().from(foods).where(eq(foods.name, "Banana, raw"));

      const exit = await runWithFoodLayers(
        confirmDescriptionEffect(
          [
            new ClarifiedIngredient({ name: "Banana", nameConfidence: "confident", quantity: 100, quantityUnit: "g", quantityConfidence: "confident" }),
          ],
          userId,
        ),
      );
      if (exit._tag !== "Success") throw new Error("unreachable");

      await Effect.runPromise(
        correctFoodNutrientsEffect(banana!.id, [{ code: NUTRIENT_CODES.energyKcal, value: 999 }]),
      );

      const snapshot = await Effect.runPromise(getDiaryEntryEffect(exit.value.id, userId));
      const kcal = snapshot?.items[0]?.nutrition.find((n) => n.code === "energy_kcal");
      expect(kcal?.value).toBe(999);

      const rows = await db.select().from(nutrientValues).where(eq(nutrientValues.foodId, banana!.id));
      const energyRow = rows.find((r) => r.code === "energy_kcal");
      expect(energyRow?.provenance).toBe("user_corrected");
    });
  });
});
