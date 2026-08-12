import pg from "pg";
import { env } from "./env";

const { Pool } = pg;

// Single shared pool for the process. Local dev and CI both point this at a
// real Postgres via DATABASE_URL (see docker-compose.yml / CI workflow's
// `postgres` service). No queries are issued yet at this scaffold stage —
// later tickets add the schema and query layer.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});
