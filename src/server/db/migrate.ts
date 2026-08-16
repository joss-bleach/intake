import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as drizzleMigrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../db";
import type * as schema from "./schema";

export const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../drizzle",
);

// Applies pending SQL migrations under drizzle/, tracked so re-runs are
// safe. Defaults to the app's own `db`; alchemy.run.ts passes one pointed
// straight at Neon instead, since deploy-time migration runs before any
// Worker binding exists.
export const migrate = (target: NodePgDatabase<typeof schema> = db): Promise<void> =>
  drizzleMigrate(target, { migrationsFolder });

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
