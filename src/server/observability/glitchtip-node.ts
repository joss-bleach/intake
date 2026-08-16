import * as Sentry from "@sentry/node";
import { env } from "../env";

// Node-only GlitchTip init, kept out of glitchtip.ts so `@sentry/node`
// never reaches the Worker bundle (the Worker initializes
// `@sentry/cloudflare` in worker.ts instead). Called at startup by Node
// entrypoints that should report: dev-server.ts, tripwire-cli.ts, eval CLIs.
let initialized = false;
export const initGlitchtip = (): void => {
  if (initialized) return;
  initialized = true;
  Sentry.init({
    dsn: env.GLITCHTIP_DSN,
    // No DSN (local dev, CI, or before the VPS deployment lands) — the SDK
    // no-ops every capture call rather than throwing, so callers never need
    // to guard on whether tracking is configured.
    enabled: env.GLITCHTIP_DSN !== undefined,
    tracesSampleRate: 0,
  });
};
