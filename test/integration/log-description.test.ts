import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { Effect, Layer, Schema } from "effect";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../../src/server/db";
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
import { getDiaryEntryEffect, logDescriptionEffect } from "../../src/server/log-description/log-description";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures",
);

// Fakes for the two AI calls the pipeline makes (Stage 2 parse, and the
// total-database-gap fallback's nutrition estimate) — same DI seam pattern
// as test/unit/ai/*.test.ts, keyed off the description text so a scenario's
// whole shape (ingredients, quantities, confidence) is declared in one place.
const fakeAttempt =
  (byPrompt: (prompt: string) => unknown) =>
  <A, I>(call: { readonly prompt: string; readonly schema: Schema.Schema<A, I> }): Effect.Effect<A, AiSdkError> =>
    Schema.decodeUnknown(call.schema)(byPrompt(call.prompt)).pipe(
      Effect.mapError(
        (cause) => new AiSdkError({ message: "test fixture decode failed", cause, reason: "parse_failure" }),
      ),
    );

type ParsedIngredientFixture = {
  readonly name: string;
  readonly nameConfidence: "confident" | "needs_review";
  readonly quantity: number;
  readonly quantityUnit: "g" | "ml" | "serving";
  readonly quantityConfidence: "confident" | "needs_review";
};

const parseIngredients = (ingredients: ReadonlyArray<ParsedIngredientFixture>) =>
  fakeAttempt(() => ({ ingredients }));

const alwaysFailingAttempt = <A, I>(_call: {
  readonly prompt: string;
  readonly schema: Schema.Schema<A, I>;
}): Effect.Effect<A, AiSdkError> =>
  Effect.fail(new AiSdkError({ message: "malformed", cause: undefined, reason: "parse_failure" }));

type EstimatedNutritionFixture = {
  readonly energyKcal: number;
  readonly proteinG: number;
  readonly carbohydrateG: number;
  readonly fatG: number;
};

const estimateNutrition = (estimate: EstimatedNutritionFixture) => fakeAttempt(() => estimate);

let userId: string;

const runLogDescription = (
  description: string,
  parseAttempt: ReturnType<typeof fakeAttempt> | typeof alwaysFailingAttempt,
  estimateAttempt: ReturnType<typeof fakeAttempt> = estimateNutrition({
    energyKcal: 0,
    proteinG: 0,
    carbohydrateG: 0,
    fatG: 0,
  }),
) =>
  Effect.runPromiseExit(
    logDescriptionEffect(description, userId, parseAttempt, estimateAttempt).pipe(
      Effect.provide(FoodLookupRateLimiter.Default),
      Effect.provide(Layer.succeed(OffLiveClient, { _tag: "OffLiveClient", search: () => Effect.succeed([]) })),
    ),
  );

describe("logDescriptionEffect (issue #46, happy path)", () => {
  beforeAll(async () => {
    await migrate();
    await ingestOffDump(path.join(fixturesDir, "off-sample.jsonl"));
    await ingestCofidCsv(path.join(fixturesDir, "cofid-sample.csv"));
    const [row] = await db
      .insert(user)
      .values({ id: crypto.randomUUID(), name: "Test User", email: "log-description@example.com" })
      .returning();
    userId = row.id;
  });

  afterEach(async () => {
    await db.delete(loggedItems);
    await db.delete(diaryEntries);
    await db.delete(foodLookupRateLimitWindows);
    // Only the llm_estimate_fallback foods this suite writes — the OFF/CoFID
    // fixture rows stay put for the next test.
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

  it("saves one diary entry with one logged item per ingredient, all matched to the database", async () => {
    const exit = await runLogDescription(
      "Weetabix with a banana",
      parseIngredients([
        { name: "Weetabix", nameConfidence: "confident", quantity: 40, quantityUnit: "g", quantityConfidence: "confident" },
        { name: "Banana", nameConfidence: "confident", quantity: 100, quantityUnit: "g", quantityConfidence: "confident" },
      ]),
    );

    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") throw new Error("unreachable");

    const snapshot = await Effect.runPromise(getDiaryEntryEffect(exit.value.id, userId));
    expect(snapshot?.items).toHaveLength(2);
    expect(snapshot?.items.every((item) => item.source === "database")).toBe(true);
    expect(snapshot?.items.every((item) => item.confidence === "confident")).toBe(true);
    expect(snapshot?.items.map((item) => item.foodName)).toEqual(
      expect.arrayContaining(["Weetabix Original", "Banana, raw"]),
    );
  });

  it("saves a needs_review item for an estimated quantity, without blocking the save", async () => {
    const exit = await runLogDescription(
      "A splash of banana in my bowl",
      parseIngredients([
        { name: "Banana", nameConfidence: "confident", quantity: 30, quantityUnit: "g", quantityConfidence: "needs_review" },
      ]),
    );

    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") throw new Error("unreachable");

    const snapshot = await Effect.runPromise(getDiaryEntryEffect(exit.value.id, userId));
    expect(snapshot?.items[0]?.confidence).toBe("needs_review");
    expect(snapshot?.items[0]?.source).toBe("database");
  });

  it("falls back to an LLM estimate on a total database gap, flagged needs_review, and saves it", async () => {
    const exit = await runLogDescription(
      "Dragon fruit protein smoothie from that new place",
      parseIngredients([
        {
          name: "Dragon fruit protein smoothie",
          nameConfidence: "needs_review",
          quantity: 500,
          quantityUnit: "ml",
          quantityConfidence: "needs_review",
        },
      ]),
      estimateNutrition({ energyKcal: 320, proteinG: 22, carbohydrateG: 45, fatG: 4 }),
    );

    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") throw new Error("unreachable");

    const snapshot = await Effect.runPromise(getDiaryEntryEffect(exit.value.id, userId));
    const item = snapshot?.items[0];
    expect(item?.source).toBe("llm_estimate_fallback");
    expect(item?.confidence).toBe("needs_review");

    // Normalized to per-100ml then scaled back up by the logged 500ml
    // quantity should reconstruct the model's original whole-quantity
    // estimate exactly.
    const kcal = item?.nutrition.find((n) => n.code === "energy_kcal");
    expect(kcal?.value).toBeCloseTo((320 / 500) * 100, 5);

    // The underlying nutrient_values rows must carry the same provenance as
    // the food they belong to — not writeFoodNutrients' hard-coded
    // "database", which would mislabel a model estimate as a database fact.
    const foodRows = await db.select().from(foods).where(eq(foods.name, "Dragon fruit protein smoothie"));
    const nutrientRows = await db
      .select()
      .from(nutrientValues)
      .where(eq(nutrientValues.foodId, foodRows[0]!.id));
    expect(nutrientRows.every((row) => row.provenance === "llm_estimate_fallback")).toBe(true);
  });

  it("keeps a fallback item's unit as 'serving', not silently swapped to the food's basisUnit (issue #79 review fix)", async () => {
    const exit = await runLogDescription(
      "A bowl of some homemade dal I can't find anywhere",
      parseIngredients([
        {
          name: "Homemade dal",
          nameConfidence: "needs_review",
          quantity: 1,
          quantityUnit: "serving",
          quantityConfidence: "needs_review",
        },
      ]),
      estimateNutrition({ energyKcal: 400, proteinG: 18, carbohydrateG: 50, fatG: 12 }),
    );

    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") throw new Error("unreachable");

    const snapshot = await Effect.runPromise(getDiaryEntryEffect(exit.value.id, userId));
    const item = snapshot?.items[0];
    expect(item?.source).toBe("llm_estimate_fallback");
    expect(item?.quantityUnit).toBe("serving");

    // A synthetic servingSize lets the "serving" quantity reconstruct the
    // model's whole-quantity estimate exactly, same as the ml case above.
    const kcal = item?.nutrition.find((n) => n.code === "energy_kcal");
    expect(kcal?.value).toBeCloseTo(400, 5);
  });

  it("hard-fails and saves nothing when the parse is malformed and the retry also fails", async () => {
    const exit = await runLogDescription("asdkjfh q98q3rkj not real food words", alwaysFailingAttempt);

    expect(exit._tag).toBe("Failure");
    const failure = exit._tag === "Failure" && exit.cause._tag === "Fail" ? exit.cause.error : null;
    expect(failure).toMatchObject({ _tag: "DescriptionParseFailedError" });

    const allEntries = await db.select().from(diaryEntries);
    expect(allEntries).toHaveLength(0);
  });
});
