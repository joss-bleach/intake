import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Schema } from "effect";

// Model responses, cached and committed to git (issue #48's acceptance
// criteria) — one file per fixture, keyed only by fixture id, holding
// whatever the *currently pinned* model produced for it. This is
// deliberately not keyed by model too: the cache represents "the response
// CI scores against right now", singular, not a growing matrix of every
// candidate ever tried. Re-running with `--refresh` overwrites the entry —
// that overwrite, showing up as a real diff on the fixture's cache file, is
// how a model-selection change (ADR 0005) becomes reviewable.
const CACHE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test/fixtures/eval/cache",
);

// `response`'s actual Stage 2 shape (ParsedDescription/ParsedLabelReading)
// is decoded by the caller, which knows which pipeline it's reading for —
// this only validates the envelope around it.
export class CacheEntry extends Schema.Class<CacheEntry>("CacheEntry")({
  model: Schema.String,
  fallbackModel: Schema.optional(Schema.String),
  cachedAt: Schema.String, // ISO timestamp; informational only
  response: Schema.Unknown,
}) {}

const cachePath = (pipeline: "description" | "label", fixtureId: string) =>
  path.join(CACHE_ROOT, pipeline, `${fixtureId}.json`);

// Cache files are committed, human-edited-adjacent JSON (a bad merge, a
// hand fix gone wrong) rather than purely machine-written — malformed or
// shape-broken content here shouldn't crash `pnpm eval` with a raw
// JSON.parse SyntaxError; it should say plainly which cache file is bad.
export const readCache = (
  pipeline: "description" | "label",
  fixtureId: string,
): CacheEntry | undefined => {
  const file = cachePath(pipeline, fixtureId);
  if (!existsSync(file)) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf-8"));
  } catch (cause) {
    throw new Error(`Cache file ${file} is not valid JSON.`, { cause });
  }

  const result = Schema.decodeUnknownEither(CacheEntry)(parsed);
  if (result._tag === "Left") {
    throw new Error(
      `Cache file ${file} doesn't match the expected {model, cachedAt, response} shape — run with --refresh to regenerate it.`,
      { cause: result.left },
    );
  }
  return result.right;
};

// Pretty-printed with a trailing newline so re-running with an unchanged
// response produces a clean `git diff` (no whole-file rewrite noise).
export const writeCache = (
  pipeline: "description" | "label",
  fixtureId: string,
  entry: CacheEntry,
): void => {
  const dir = path.join(CACHE_ROOT, pipeline);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    cachePath(pipeline, fixtureId),
    `${JSON.stringify(entry, null, 2)}\n`,
  );
};
