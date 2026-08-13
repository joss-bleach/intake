import { runEffect } from "../effect-trpc";
import { getInsightsSnapshotEffect } from "../insights/insights";
import { publicProcedure, router } from "../trpc";

export const insightsRouter = router({
  get: publicProcedure.query(({ ctx }) =>
    runEffect(getInsightsSnapshotEffect(ctx.db, new Date())),
  ),
});
