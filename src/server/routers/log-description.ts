import { Effect } from "effect";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { runEffect } from "../effect-trpc";
import { FoodLookupRateLimiter } from "../food/rate-limiter";
import { OffLiveClient } from "../food/off-client";
import { getDiaryEntryEffect, logDescriptionEffect } from "../log-description/log-description";

const createInput = z.object({
  description: z.string().trim().min(1),
});

const getInput = z.object({
  id: z.string().uuid(),
});

// Provides the two Effect services logDescriptionEffect's Stage 3 resolution
// needs (resolveFood's rate limiter and live-lookup client) — the same
// layers test/integration/food-resolution.test.ts provides, just wired for
// the router instead of a test. Neither is request-scoped state, so `.Default`
// per call is fine.
export const logDescriptionRouter = router({
  // Returns the saved entry's full snapshot (not just its id) so the client
  // can render the result in one round trip instead of a create-then-get pair.
  create: publicProcedure.input(createInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const saved = yield* logDescriptionEffect(input.description).pipe(
          Effect.provide(FoodLookupRateLimiter.Default),
          Effect.provide(OffLiveClient.Default),
        );
        return yield* getDiaryEntryEffect(saved.id);
      }),
    ),
  ),

  get: publicProcedure.input(getInput).query(({ input }) =>
    runEffect(getDiaryEntryEffect(input.id)),
  ),
});
