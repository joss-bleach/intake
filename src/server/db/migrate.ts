import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate as drizzleMigrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../db";

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../drizzle",
);

// Applies every pending SQL migration under drizzle/ (generated from
// src/server/db/schema.ts via `pnpm db:generate`), tracked by drizzle-orm's
// own `drizzle.__drizzle_migrations` table. Safe to call repeatedly —
// already-applied migrations are skipped.
export const migrate = (): Promise<void> =>
  drizzleMigrate(db, { migrationsFolder });

// Run directly via `pnpm db:migrate` — not invoked when this module is only
// imported, e.g. from tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(async () => {
      console.log("Migrations applied.");
      await pool.end();
    })
    .catch(async (error) => {
      console.error(error);
      await pool.end();
      process.exit(1);
    });
}
