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
    // Optional: AI pipelines (src/ai/effect-ai-sdk.ts) fail with AiSdkError
    // when a call is attempted without one. No default — unlike ADR 0005's
    // model choices, a key isn't something the app can pick for itself, and
    // CI intentionally runs without one (no OpenRouter account provisioned
    // yet), which is why the ADR 0001 real-round-trip test is skipped there.
    OPENROUTER_API_KEY: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
