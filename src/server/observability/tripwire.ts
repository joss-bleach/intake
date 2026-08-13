import * as Sentry from "@sentry/node";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { env } from "../env";
import { initGlitchtip } from "./glitchtip";

// Issue #49's cron tripwire: model_calls is kept indefinitely (no pruning),
// so this is the "someone should look at this" nudge past
// MODEL_CALLS_TRIPWIRE_THRESHOLD, not an enforcement mechanism. Pure
// threshold check, separate from the CLI/DB plumbing below, so the decision
// itself is trivially unit-testable.
export const isOverTripwireThreshold = (
  rowCount: number,
  threshold: number,
): boolean => rowCount >= threshold;

const currentModelCallCount = async (): Promise<number> => {
  const result = await db.execute<{ count: string }>(
    sql`select count(*) as count from model_calls`,
  );
  return Number(result.rows[0]?.count ?? 0);
};

// Run on a schedule (platform cron / a scheduled GitHub Actions workflow —
// per alchemy.run.ts, real infra provisioning is deferred to deploy). Alerts
// via GlitchTip rather than failing loudly: a full model_calls table isn't
// an application error, so `Sentry.captureMessage` (not
// `captureEffectFailure`) is the right call here — there's no Effect Cause
// to unwrap.
export const checkTripwire = async (): Promise<void> => {
  const count = await currentModelCallCount();

  if (isOverTripwireThreshold(count, env.MODEL_CALLS_TRIPWIRE_THRESHOLD)) {
    initGlitchtip();
    Sentry.captureMessage(
      `model_calls has ${count} rows, past the ${env.MODEL_CALLS_TRIPWIRE_THRESHOLD} tripwire threshold`,
      "warning",
    );
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  checkTripwire()
    .then(async () => {
      await pool.end();
    })
    .catch(async (error) => {
      console.error(error);
      await pool.end();
      process.exit(1);
    });
}
