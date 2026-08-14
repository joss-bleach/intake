import { protectedProcedure, router } from "../trpc";
import { runEffect } from "../effect-trpc";
import { getDashboardSnapshotEffect } from "../dashboard/dashboard";

// Dashboard (#53): the rolling-7-day aggregation behind the home screen —
// today's meal-grouped log + macros, streak, and the two Recharts series.
// The goal itself isn't returned here — the client already holds it from
// `goals.get`. Scoped to the caller's own logging (#89/ADR 0007).
export const dashboardRouter = router({
  get: protectedProcedure.query(({ ctx }) =>
    runEffect(getDashboardSnapshotEffect(ctx.db, new Date(), ctx.user.id)),
  ),
});
