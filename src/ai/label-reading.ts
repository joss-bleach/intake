import type { ConfidenceLevel } from "./schemas";

// Structural rather than the full ParsedLabelReading type: the client
// reuses the tRPC-inferred extract-mutation output (lib/router-types.ts),
// which types `nutrients` as a plain array, not the server-side Effect
// Schema class's `NonEmptyArray` tuple — this only needs read access to
// each field's confidence, so it accepts either shape.
interface ReadingConfidenceFields {
  readonly foodNameConfidence: ConfidenceLevel;
  readonly brand?: { readonly confidence: ConfidenceLevel };
  readonly servingSize?: { readonly confidence: ConfidenceLevel };
  readonly servingSizeDescriptor?: { readonly confidence: ConfidenceLevel };
  readonly nutrients: ReadonlyArray<{ readonly confidence: ConfidenceLevel }>;
}

// Rolls every per-field confidence tag on a ParsedLabelReading into one
// "does anything here need a second look" flag. Shared between the client
// confirm screen (silence-means-confident display, issue #47) and the save
// path (the logged_item's overall confidence) so the two never disagree
// about what counts as needing review. No Effect/schema-validation
// dependency — pure enough to import from either side of the client/server
// boundary.
export function anyFieldNeedsReview(reading: ReadingConfidenceFields): boolean {
  if (reading.foodNameConfidence === "needs_review") return true;
  if (reading.brand?.confidence === "needs_review") return true;
  if (reading.servingSize?.confidence === "needs_review") return true;
  if (reading.servingSizeDescriptor?.confidence === "needs_review") return true;
  return reading.nutrients.some((nutrient) => nutrient.confidence === "needs_review");
}

// Structural, like ReadingConfidenceFields above — only needs each
// nutrient's code.
interface ReadingNutrientCodes {
  readonly nutrients: ReadonlyArray<{ readonly code: string }>;
}

// A read that decoded successfully (it's not a ParseFailure) but is missing
// the one nutrient the rest of the app can't do without: without energy_kcal
// there's nothing meaningful to total or log against a calorie goal, unlike
// a missing macro which the confirm screen can just show as absent (issue
// #51). Drives the auto-handoff to the description path — see
// log-label-photo-screen.tsx.
export function isIncompleteReading(reading: ReadingNutrientCodes): boolean {
  return !reading.nutrients.some((nutrient) => nutrient.code === "energy_kcal");
}
