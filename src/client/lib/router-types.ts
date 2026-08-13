import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../server/router";

// Type-only import (erased at build time, same as lib/trpc.ts's AppRouter
// import) — lets the client reuse the server's zod-inferred shapes instead
// of hand-duplicating the goals/profile contract.
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export type MacroRatioInput = RouterInputs["goals"]["upsert"]["macroRatio"];
export type ProteinOverrideInput = MacroRatioInput["proteinOverride"];
export type GoalsSnapshot = RouterOutputs["goals"]["get"];
export type ProfileSnapshot = RouterOutputs["profile"]["get"];

// The Stage 2 ParsedLabelReading, as the label-photo extract mutation
// returns it (issue #47) — reused from the server's inferred output rather
// than importing src/ai's Effect Schema class into the client bundle.
export type LabelReading = RouterOutputs["labelPhoto"]["extract"];

// Issue #50: Stage 1/2's ingredient array, as `logDescription.parse`
// returns it — clarifyOptions included. Reused (not hand-duplicated) so the
// client's ClarifiedIngredient round-trip to `confirm` can't drift from
// what Stage 2 actually produces.
export type ParsedIngredient = RouterOutputs["logDescription"]["parse"]["ingredients"][number];

// The saved-entry snapshot both `confirm` and correction mutations return —
// one type for "what the review screen renders after any of those calls".
export type DiaryEntrySnapshot = NonNullable<RouterOutputs["logDescription"]["confirm"]>;
export type DiaryEntryItem = DiaryEntrySnapshot["items"][number];

// `searchFood`'s result shape — the "Something else…" and food-swap search
// UI's candidate list.
export type FoodSearchResult = RouterOutputs["logDescription"]["searchFood"][number];
