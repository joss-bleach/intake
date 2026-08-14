import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";

// Split out of router.ts so per-feature router modules (goals, profile, …)
// can import `router`/`publicProcedure` without importing the composed
// `appRouter` itself.
const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Requires a signed-in session (issue #87) — narrows ctx.session/ctx.user to
// non-null for anything built on top.
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session || !ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session, user: ctx.user } });
});
