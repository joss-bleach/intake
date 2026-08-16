import * as Sentry from "@sentry/cloudflare";
import { env } from "cloudflare:workers";
// Static import is safe: glitchtip.ts has no module-scope side effects (no
// env parse, no I/O) — unlike the app modules loaded lazily below.
import { glitchtipOptions } from "./observability/glitchtip";

// Minimal shape of what this Worker actually uses, rather than pulling in
// @cloudflare/workers-types wholesale — its global Request/Response
// declarations collide with the project's DOM lib (already sufficient for
// fetch-handler code; see context.ts/app.ts).
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
interface ScheduledController {
  readonly cron: string;
}

// Reading HYPERDRIVE.connectionString mints credentials — "random values in
// global scope", validation error 10021 — so it happens per handler call, and
// the app modules (whose imports run module-scope setup) load lazily too.
type Modules = [
  typeof import("./app"),
  typeof import("./observability/tripwire"),
  typeof import("./db"),
];
let modulesPromise: Promise<Modules> | undefined;
const loadModules = (): Promise<Modules> =>
  (modulesPromise ??= Promise.all([
    import("./app"),
    import("./observability/tripwire"),
    import("./db"),
  ]).then((modules) => {
    // The singleton pool would silently point at DATABASE_URL's localhost
    // default here — only request-scoped handles are safe in workerd.
    modules[2].requireRequestScope();
    return modules;
  }));

// OFF ingest (issue #44) stays a scheduled GitHub Actions job, not a Worker
// cron — it streams a multi-GB dump from local disk, which a Worker can
// neither download into nor hold; see docs/adr/0008 and off-ingest.yml.
const handler = {
  // Each request gets its own pool, scoped via withDb: Workers forbid using a
  // socket opened in one request from another (issue #107's alternating
  // hang), and Hyperdrive pools upstream so per-request connect is cheap.
  fetch: async (request: Request, _env: typeof env, ctx: ExecutionContext) => {
    const [{ handleApiRequest }, , { createDb, withDb }] = await loadModules();
    const handle = createDb(env.HYPERDRIVE.connectionString);
    try {
      return await withDb(handle, () => handleApiRequest(request));
    } finally {
      ctx.waitUntil(handle.pool.end());
    }
  },
  scheduled: (_controller: ScheduledController, _env: typeof env, ctx: ExecutionContext) => {
    ctx.waitUntil(
      (async () => {
        const [, { checkTripwire }, { createDb, withDb }] = await loadModules();
        const handle = createDb(env.HYPERDRIVE.connectionString);
        try {
          await withDb(handle, () => checkTripwire());
        } finally {
          await handle.pool.end();
        }
      })(),
    );
  },
};

// `@sentry/cloudflare`, not `@sentry/node`, which assumes Node http/OTel
// internals and silently drops every event on workerd (issue #107, fix 3).
// Shared capture code (glitchtip.ts) calls `@sentry/core`, which routes to
// the client withSentry initializes per invocation.
export default Sentry.withSentry(() => glitchtipOptions(env.GLITCHTIP_DSN), handler);
