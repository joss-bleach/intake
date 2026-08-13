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

// The dashboard's rolling-7-day activity aggregation (issue #53).
export type DashboardSnapshot = RouterOutputs["dashboard"]["get"];
export type DashboardMealGroup = DashboardSnapshot["meals"][number];
