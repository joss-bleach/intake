import { pool } from "../db";
import { initGlitchtip } from "./glitchtip-node";
import { checkTripwire } from "./tripwire";

// CLI entrypoint for `pnpm observability:tripwire` — separate from
// tripwire.ts so the Worker bundle (which imports checkTripwire) never pulls
// in `@sentry/node` via initGlitchtip.
initGlitchtip();
checkTripwire()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
