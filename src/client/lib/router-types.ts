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
