import * as Sentry from "@sentry/node";
import { env } from "../env";
import { glitchtipOptions } from "./glitchtip";

// Node-only GlitchTip init, kept out of glitchtip.ts so `@sentry/node`
// never reaches the Worker bundle (the Worker initializes
// `@sentry/cloudflare` in worker.ts instead). Called at startup by Node
// entrypoints that should report: dev-server.ts, tripwire-cli.ts, eval CLIs.
let initialized = false;
export const initGlitchtip = (): void => {
  if (initialized) return;
  initialized = true;
  Sentry.init(glitchtipOptions(env.GLITCHTIP_DSN));
};
