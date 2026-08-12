import { initTRPC } from "@trpc/server";
import { Effect } from "effect";
import { runEffect } from "./effect-trpc";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

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
});

export type AppRouter = typeof appRouter;
