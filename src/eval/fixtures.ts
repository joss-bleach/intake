import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Schema } from "effect";

// Eval harness (issue #48, part of #39). Fixtures are git-versioned JSON
// files (label fixtures carry a sibling photo) rather than rows in a table
// — a fixture is reviewed and diffed like code, which a database row isn't.
// Each fixture's `expected` shape mirrors its pipeline's Stage 2 schema
// (src/ai/schemas.ts) minus the confidence tags: ground truth is a value,
// not a confidence claim about a value — scoring.ts compares a model's
// Stage 2 output against this.

const FIXTURES_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test/fixtures/eval",
);

// Every fixture, regardless of pipeline, carries these three: an id stable
// enough to key a cache entry on, whether its own ground truth is
// spot-checked/human-reviewed rather than fully verified (surfaced in
// reports, never gates CI — same "needs_review tracked separately" rule the
// brief applies to model output), and free-text provenance for "where did
// this number come from" audits.
const FixtureMeta = {
  id: Schema.String,
  groundTruthReviewed: Schema.Boolean,
  groundTruthSource: Schema.String,
};

export class DescriptionFixtureExpectedIngredient extends Schema.Class<DescriptionFixtureExpectedIngredient>(
  "DescriptionFixtureExpectedIngredient",
)({
  name: Schema.String,
  quantity: Schema.Positive,
  quantityUnit: Schema.Literal("g", "ml", "serving"),
}) {}

export class DescriptionFixture extends Schema.Class<DescriptionFixture>(
  "DescriptionFixture",
)({
  ...FixtureMeta,
  input: Schema.String,
  expected: Schema.Struct({
    ingredients: Schema.NonEmptyArray(DescriptionFixtureExpectedIngredient),
  }),
}) {}

export class LabelFixtureExpectedNutrient extends Schema.Class<LabelFixtureExpectedNutrient>(
  "LabelFixtureExpectedNutrient",
)({
  code: Schema.String,
  value: Schema.Number,
  unit: Schema.String,
}) {}

export class LabelFixture extends Schema.Class<LabelFixture>("LabelFixture")({
  ...FixtureMeta,
  // Relative to the fixture's own JSON file, matching a real photo capture
  // workflow (drop a photo next to its ground-truth JSON).
  imageFile: Schema.String,
  imageMediaType: Schema.Literal("image/jpeg", "image/png"),
  expected: Schema.Struct({
    foodName: Schema.String,
    brand: Schema.optional(Schema.String),
    basisUnit: Schema.Literal("g", "ml"),
    servingSize: Schema.optional(Schema.Positive),
    nutrients: Schema.NonEmptyArray(LabelFixtureExpectedNutrient),
  }),
}) {}

const readJsonFiles = (dir: string): unknown[] =>
  readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(readFileSync(path.join(dir, file), "utf-8")));

export const loadDescriptionFixtures = (): readonly DescriptionFixture[] =>
  readJsonFiles(path.join(FIXTURES_ROOT, "description")).map((raw) =>
    Schema.decodeUnknownSync(DescriptionFixture)(raw),
  );

export const loadLabelFixtures = (): readonly LabelFixture[] =>
  readJsonFiles(path.join(FIXTURES_ROOT, "label")).map((raw) =>
    Schema.decodeUnknownSync(LabelFixture)(raw),
  );

// Label fixtures reference their photo by filename rather than embedding it
// inline (keeps the JSON reviewable as text); this resolves that reference
// to base64 for the multimodal call effect-ai-sdk.ts's `images` param
// expects. Only needed on the live-call path (run.ts --refresh) — scoring
// against an already-cached response never touches the photo.
export const readLabelImageBase64 = (fixture: LabelFixture): string =>
  readFileSync(
    path.join(FIXTURES_ROOT, "label", fixture.imageFile),
  ).toString("base64");
