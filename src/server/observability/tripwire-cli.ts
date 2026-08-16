import { pool } from "../db";
import { initGlitchtip } from "./glitchtip-node";
import { checkTripwire } from "./tripwire";

// CLI entrypoint for `pnpm observability:tripwire` — separate from
// tripwire.ts so the Worker bundle (which imports checkTripwire) never pulls
// in `@sentry/node` via initGlitchtip.
initGlitchtip();
checkTripwire()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
