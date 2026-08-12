import { initTRPC } from "@trpc/server";
import type { Context } from "./context";

// Split out of router.ts so per-feature router modules (goals, profile, …)
// can import `router`/`publicProcedure` without importing the composed
// `appRouter` itself.
const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
