import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "./env";
import * as schema from "./db/schema";

const { Pool } = pg;

// Single shared pool for the process. Local dev and CI both point this at a
// real Postgres via DATABASE_URL (see docker-compose.yml / CI workflow's
// `postgres` service).
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

// Drizzle query layer over the same pool — this is what procedures/tests
// should use. `pool` stays exported for the migrator and any raw-SQL escape
// hatch.
export const db = drizzle(pool, { schema });

// The handle a `db.transaction(async (tx) => ...)` callback receives. Code
// that must run inside a caller-owned transaction takes this instead of `db`,
// so the transaction boundary is visible at the call site rather than hidden
// one level down.
export type Transaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
