import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// Validated, typesafe server-side environment (https://env.t3.gg/docs/core).
// Server-only: this module must never be imported from src/client — it reads
// process.env, which doesn't exist in the browser. If/when client code needs
// env vars, add a sibling src/client/env.ts with its own createEnv() call
// reading import.meta.env, using a VITE_-prefixed clientPrefix.
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
    // Optional: AI pipelines (src/ai/effect-ai-sdk.ts) fail with AiSdkError
    // when a call is attempted without one. No default — unlike ADR 0005's
    // model choices, a key isn't something the app can pick for itself, and
    // CI intentionally runs without one (no OpenRouter account provisioned
    // yet), which is why the ADR 0001 real-round-trip test is skipped there.
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    // Label-photo OCR (issue #47) model roles. ADR 0005's actual picks are
    // still TBD pending the model-selection bake-off (#54) — these defaults
    // are placeholders drawn from that ADR's vision candidate shortlist (a
    // cheap/fast primary, a cost-agnostic-accuracy fallback), overridable so
    // swapping in the real bake-off picks doesn't need a code change.
    LABEL_VISION_MODEL: z.string().min(1).default("google/gemini-2.5-flash-lite"),
    LABEL_VISION_FALLBACK_MODEL: z.string().min(1).default("google/gemini-2.5-pro"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
