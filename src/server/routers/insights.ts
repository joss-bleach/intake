import { runEffect } from "../effect-trpc";
import { getInsightsSnapshotEffect } from "../insights/insights";
import { protectedProcedure, router } from "../trpc";

// Scoped to the caller's own logging (#89/ADR 0007).
export const insightsRouter = router({
  get: protectedProcedure.query(({ ctx }) =>
    runEffect(getInsightsSnapshotEffect(ctx.db, new Date(), ctx.user.id)),
  ),
});
