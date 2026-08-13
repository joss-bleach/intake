import { publicProcedure, router } from "../trpc";
import { runEffect } from "../effect-trpc";
import { getDashboardSnapshotEffect } from "../dashboard/dashboard";

// Dashboard (#53): the rolling-7-day aggregation behind the home screen —
// today's meal-grouped log + macros, the logging streak, and the two
// Recharts series (calories-vs-goal history, macro split). The calorie/macro
// *goal* itself isn't returned here — the client already holds it from
// `goals.get` (App.tsx's onboarding gate fetches it before this screen ever
// renders), so this stays a plain activity query instead of re-deriving
// goals a second time.
export const dashboardRouter = router({
  get: publicProcedure.query(({ ctx }) =>
    runEffect(getDashboardSnapshotEffect(ctx.db, new Date())),
  ),
});
