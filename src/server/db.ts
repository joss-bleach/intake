import pg from "pg";

const { Pool } = pg;

// Single shared pool for the process. Local dev and CI both point this at a
// real Postgres via DATABASE_URL (see docker-compose.yml / CI workflow's
// `postgres` service). No queries are issued yet at this scaffold stage —
// later tickets add the schema and query layer.
export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://intake:intake@localhost:5432/intake",
});
