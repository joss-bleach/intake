import { Effect } from "effect";
import { runEffect } from "./effect-trpc";
import { FOOD_DATA_ATTRIBUTION } from "./food/attribution";
import { publicProcedure, router } from "./trpc";
import { goalsRouter, profileRouter } from "./routers/goals";
import { labelPhotoRouter } from "./routers/label-photo";
import { logDescriptionRouter } from "./routers/log-description";
import { dashboardRouter } from "./routers/dashboard";
import { savedMealsRouter } from "./routers/saved-meals";

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
  // Global OFF/CoFID attribution credit (issue #44) — not per-item, so this
  // is the app's one place to satisfy both licenses' "credit the database"
  // requirement. No UI reads it yet; a future about/settings screen will.
  foodDataAttribution: publicProcedure.query(() =>
    runEffect(Effect.sync(() => FOOD_DATA_ATTRIBUTION)),
  ),

  // Onboarding & goals (#45): calorie/macro goals and bodyweight, each a
  // singleton row (see db/schema.ts) editable at onboarding and afterward
  // from the profile screen.
  goals: goalsRouter,
  profile: profileRouter,

  // Log by description, happy path (#46): free-text -> parse -> resolve ->
  // save. Ambiguity/correction UI is #50's concern, not this router's.
  logDescription: logDescriptionRouter,

  // Log by label photo (#47): OCR extraction + confirmed-amount save, no
  // food-database resolution — see routers/label-photo.ts.
  labelPhoto: labelPhotoRouter,

  // Dashboard (#53): rolling-7-day activity aggregation for the home screen.
  dashboard: dashboardRouter,

  // Saved meals & recently-logged (#52): search over logging history,
  // frequency/recency-ranked suggestions, and named multi-item SavedMeals —
  // see routers/saved-meals.ts.
  savedMeals: savedMealsRouter,
});

export type AppRouter = typeof appRouter;
