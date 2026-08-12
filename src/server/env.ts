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
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
