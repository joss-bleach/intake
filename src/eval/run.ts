import { Effect, Schema } from "effect";
import { type AiSdkError, generateObjectWithFallbackEffect } from "../ai/effect-ai-sdk";
import { ParsedDescription, ParsedLabelReading } from "../ai/schemas";
import { type CacheEntry, readCache, writeCache } from "./cache";
import {
  loadDescriptionFixtures,
  loadLabelFixtures,
  readLabelImageBase64,
} from "./fixtures";
import { descriptionPrompt, labelPrompt } from "./prompts";
import {
  type AggregateResult,
  DESCRIPTION_ACCURACY_FLOOR,
  type ItemResult,
  LABEL_ACCURACY_FLOOR,
  aggregate,
  scoreDescriptionItem,
  scoreLabelItem,
} from "./scoring";

// Standalone, cache-first Effect script (issue #48): scores both AI
// pipelines against their fixtures and fails (nonzero exit) below the
// brief's accuracy floor. Cache-only by default — the normal CI invocation
// (`pnpm eval`, no flags) never calls a model or needs OPENROUTER_API_KEY,
// matching every other CI job (see .env.example / src/server/env.ts).
// `--refresh --model=<id> --fallback-model=<id>` is the one path that calls
// live, for whoever's updating the pinned response (a new fixture, a
// model-selection change) — that run needs a real key and commits the
// resulting cache diff.
export interface RunOptions {
  readonly pipeline: "description" | "label" | "all";
  readonly refresh: boolean;
  readonly model?: string;
  readonly fallbackModel?: string;
}

export class NoCachedResponseError extends Error {
  constructor(fixtureId: string) {
    super(
      `No cached response for fixture "${fixtureId}", and no --model/--fallback-model given for a live call. ` +
        `Run with --refresh --model=<id> --fallback-model=<id> (needs OPENROUTER_API_KEY) to populate it.`,
    );
    this.name = "NoCachedResponseError";
  }
}

interface LiveCall {
  readonly prompt: string;
  readonly images?: ReadonlyArray<{ readonly data: string; readonly mediaType: string }>;
}

// Cache-first resolution, shared by both pipelines: prefer the committed
// response; only build the (potentially image-carrying) live call when
// there's no cache to use, or --refresh forces a re-call — `buildLiveCall`
// is a thunk specifically so a label fixture's photo is never read off disk
// on the common cached-response path.
const resolveResponse = <A, I>(
  pipeline: "description" | "label",
  fixtureId: string,
  schema: Schema.Schema<A, I>,
  buildLiveCall: () => LiveCall,
  options: RunOptions,
): Effect.Effect<A, AiSdkError | NoCachedResponseError> =>
  Effect.gen(function* () {
    const cached = options.refresh ? undefined : readCache(pipeline, fixtureId);
    if (cached) {
      return yield* Schema.decodeUnknown(schema)(cached.response).pipe(
        Effect.orDie,
      );
    }

    if (!options.model || !options.fallbackModel) {
      return yield* Effect.fail(new NoCachedResponseError(fixtureId));
    }

    const { prompt, images } = buildLiveCall();
    const response = yield* generateObjectWithFallbackEffect({
      model: options.model,
      fallbackModel: options.fallbackModel,
      prompt,
      images,
      schema,
    });

    const entry: CacheEntry = {
      model: options.model,
      fallbackModel: options.fallbackModel,
      cachedAt: new Date().toISOString(),
      response,
    };
    writeCache(pipeline, fixtureId, entry);

    return response;
  });

const runDescriptionPipeline = (
  options: RunOptions,
): Effect.Effect<readonly ItemResult[], AiSdkError | NoCachedResponseError> =>
  Effect.gen(function* () {
    const fixtures = loadDescriptionFixtures();
    const results: ItemResult[] = [];
    for (const fixture of fixtures) {
      const response = yield* resolveResponse(
        "description",
        fixture.id,
        ParsedDescription,
        () => ({ prompt: descriptionPrompt(fixture) }),
        options,
      );
      results.push(scoreDescriptionItem(fixture, response));
    }
    return results;
  });

const runLabelPipeline = (
  options: RunOptions,
): Effect.Effect<readonly ItemResult[], AiSdkError | NoCachedResponseError> =>
  Effect.gen(function* () {
    const fixtures = loadLabelFixtures();
    const results: ItemResult[] = [];
    for (const fixture of fixtures) {
      const response = yield* resolveResponse(
        "label",
        fixture.id,
        ParsedLabelReading,
        () => ({
          prompt: labelPrompt(),
          images: [
            {
              data: readLabelImageBase64(fixture),
              mediaType: fixture.imageMediaType,
            },
          ],
        }),
        options,
      );
      results.push(scoreLabelItem(fixture, response));
    }
    return results;
  });

const printReport = (
  label: string,
  agg: AggregateResult,
  results: readonly ItemResult[],
): void => {
  const rate = agg.total === 0 ? "n/a (no fixtures)" : `${agg.passRate.toFixed(1)}%`;
  console.log(
    `\n${label}: ${agg.passed}/${agg.total} passed (${rate}), floor ${agg.floorPct}% -> ${agg.meetsFloor ? "PASS" : "FAIL"}`,
  );
  if (agg.itemsNeedingReview > 0) {
    console.log(
      `  ${agg.itemsNeedingReview} item(s) had a field the model flagged needs_review (informational, not gating)`,
    );
  }
  for (const result of results.filter((r) => !r.pass)) {
    console.log(`  ✗ ${result.id}`);
    for (const failure of result.failures) console.log(`      ${failure}`);
  }
};

export interface RunSummary {
  readonly description?: AggregateResult;
  readonly label?: AggregateResult;
}

export const runEval = (
  options: RunOptions,
): Effect.Effect<RunSummary, AiSdkError | NoCachedResponseError> =>
  Effect.gen(function* () {
    let description: AggregateResult | undefined;
    let label: AggregateResult | undefined;

    if (options.pipeline === "description" || options.pipeline === "all") {
      const results = yield* runDescriptionPipeline(options);
      description = aggregate(results, DESCRIPTION_ACCURACY_FLOOR);
      printReport("Description parsing", description, results);
    }

    if (options.pipeline === "label" || options.pipeline === "all") {
      const results = yield* runLabelPipeline(options);
      label = aggregate(results, LABEL_ACCURACY_FLOOR);
      printReport("Label reading", label, results);
    }

    return { description, label };
  });

export const parseArgs = (argv: readonly string[]): RunOptions => {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    flags.set(key, rest.length > 0 ? rest.join("=") : "true");
  }
  const pipeline = flags.get("pipeline");
  return {
    pipeline:
      pipeline === "description" || pipeline === "label" ? pipeline : "all",
    refresh: flags.get("refresh") === "true",
    model: flags.get("model"),
    fallbackModel: flags.get("fallback-model"),
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));
  Effect.runPromise(runEval(options))
    .then((summary) => {
      const gates = [summary.description, summary.label].filter(
        (g): g is AggregateResult => g !== undefined,
      );
      const allPass = gates.every((g) => g.meetsFloor);
      if (!allPass) console.error("\nEval harness failed: below accuracy floor.");
      process.exit(allPass ? 0 : 1);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
