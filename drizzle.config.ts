import { defineConfig } from "drizzle-kit";
import { env } from "./src/server/env";

// `pnpm db:generate` reads schema.ts and writes SQL migrations here;
// `pnpm db:migrate` (src/server/db/migrate.ts) applies them.
export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
