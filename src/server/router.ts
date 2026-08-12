import { Effect } from "effect";
import { runEffect } from "./effect-trpc";
import { publicProcedure, router } from "./trpc";
import { goalsRouter, profileRouter } from "./routers/goals";

export const appRouter = router({
  // Trivial smoke-test procedure: proves the client/server/query-layer wiring
  // works end-to-end, and that a procedure's success path runs through
  // Effect (see effect-trpc.ts) rather than returning a bare promise.
  ping: publicProcedure.query(() =>
    runEffect(
      Effect.sync(() => ({
        message: "pong" as const,
        timestamp: new Date().toISOString(),
      })),
    ),
  ),

  // Onboarding & goals (#45): calorie/macro goals and bodyweight, each a
  // singleton row (see db/schema.ts) editable at onboarding and afterward
  // from the profile screen.
  goals: goalsRouter,
  profile: profileRouter,
});

export type AppRouter = typeof appRouter;
