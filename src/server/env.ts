import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// Validated, typesafe server-side environment (https://env.t3.gg/docs/core).
// Server-only: this module must never be imported from src/client — it reads
// process.env, which doesn't exist in the browser. If/when client code needs
// env vars, add a sibling src/client/env.ts with its own createEnv() call
// reading import.meta.env, using a VITE_-prefixed clientPrefix.

// Rejected explicitly by the BETTER_AUTH_SECRET schema below. Named here so
// the check can't drift from the value .env.example and older docs suggest.
const DEV_PLACEHOLDER_SECRET = "dev-secret-change-in-production";

export const env = createEnv({
  server: {
    DATABASE_URL: z
      .url()
      .default("postgres://intake:intake@localhost:5432/intake"),
    PORT: z.coerce.number().int().positive().default(3001),
    // Guards the rare live-OFF-lookup fallback in resolveFood (issue #44) —
    // deliberately small: the normal path never touches the network, so this
    // only needs to keep genuine cache misses from hammering OFF's API.
    FOOD_LOOKUP_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
    FOOD_LOOKUP_RATE_LIMIT_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
    // Per-account ceiling on paid model calls (label OCR, description
    // parsing) — see src/server/model-call-rate-limiter.ts. Sized for a
    // person logging meals, not for a client in a loop: a busy few minutes
    // of logging is a handful of calls, so 20/minute leaves plenty of room
    // while still bounding what one stolen session can spend.
    MODEL_CALL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    MODEL_CALL_RATE_LIMIT_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
    // Optional: AI pipelines (src/ai/effect-ai-sdk.ts) fail with AiSdkError
    // when a call is attempted without one. No default — unlike ADR 0005's
    // model choices, a key isn't something the app can pick for itself, and
    // CI intentionally runs without one (no OpenRouter account provisioned
    // yet), which is why the ADR 0001 real-round-trip test is skipped there.
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    // Label-photo OCR (issue #47) model roles — ADR 0005's actual bake-off
    // picks (issue #54): cheapest working candidate for the primary tier,
    // highest-accuracy-among-equals for the cost-agnostic fallback tier.
    // Still overridable, e.g. for a future re-run once ADR 0005's trigger
    // conditions fire (deprecation, price shift, notable new entrant).
    LABEL_VISION_MODEL: z.string().min(1).default("google/gemini-2.5-flash-lite"),
    LABEL_VISION_FALLBACK_MODEL: z
      .string()
      .min(1)
      .default("qwen/qwen3-vl-235b-a22b-instruct"),
    // Optional (issue #49): the self-hosted GlitchTip project DSN.
    // captureEffectFailure (src/server/observability/glitchtip.ts) no-ops
    // without one — real GlitchTip deployment on the VPS is infra
    // provisioning, out of this repo's scope (see the MVP spec's carve-out).
    GLITCHTIP_DSN: z.url().optional(),
    // Row-count threshold the cron tripwire (src/server/observability/
    // tripwire.ts) alerts past — model_calls is kept indefinitely, so this
    // is a "someone should look at this" nudge, not a hard cap.
    MODEL_CALLS_TRIPWIRE_THRESHOLD: z.coerce
      .number()
      .int()
      .positive()
      .default(500_000),
    // Text/description-parsing model — ADR 0005's actual bake-off pick
    // (issue #54): best real accuracy among candidates that actually work
    // against our schema (two OpenAI-family candidates were disqualified by
    // a live structured-output schema incompatibility uncovered during the
    // bake-off — see ADR 0005). Overridable for a future re-run.
    DESCRIPTION_PARSE_MODEL: z.string().min(1).default("deepseek/deepseek-chat-v3.1"),
    // Sign-in (issue #87, ADR 0006): signs betterauth's session cookies.
    // Deliberately has no default, unlike DATABASE_URL: a wrong DATABASE_URL
    // fails loudly on the first query, whereas a defaulted signing secret
    // works perfectly while letting anyone who has read the repo forge a
    // session cookie for any user. Fail at boot instead. Generate one with
    // `openssl rand -base64 32`; local dev and CI set it like any other var.
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters")
      .refine(
        (secret) => secret !== DEV_PLACEHOLDER_SECRET,
        "BETTER_AUTH_SECRET is still the placeholder — generate one with `openssl rand -base64 32`",
      ),
    // Where betterauth's own /api/auth/* handler is reachable from — used to
    // build its cookies/redirects, not the app's public URL.
    BETTER_AUTH_URL: z.url().default("http://localhost:3001"),
    // The client origin allowed to make credentialed auth requests
    // (trustedOrigins + CORS) — Vite's dev server by default.
    CLIENT_ORIGIN: z.url().default("http://localhost:5173"),
    // Optional — unset locally/CI is fine; sending an OTP email throws until
    // one is provisioned, matching OPENROUTER_API_KEY's pattern. Tests build
    // their own auth instance with a stub mailer (see src/server/auth), so
    // they never touch this.
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM_EMAIL: z.string().min(1).default("Intake <onboarding@resend.dev>"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
