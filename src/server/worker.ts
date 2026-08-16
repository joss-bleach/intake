import "./worker-env";
import { handleApiRequest } from "./app";
import { checkTripwire } from "./observability/tripwire";

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
// Bindings aren't read here — worker-env.ts already bridged the one binding
// (Hyperdrive) any code in this file needs, via process.env.
interface WorkerBindings {
  readonly HYPERDRIVE: { readonly connectionString: string };
}

// OFF ingest (issue #44) stays a scheduled GitHub Actions job, not a Worker
// cron — it streams a multi-GB dump from local disk, which a Worker can
// neither download into nor hold; see docs/adr/0008 and off-ingest.yml.
export default {
  fetch: (request: Request) => handleApiRequest(request),
  scheduled: (_controller: ScheduledController, _env: WorkerBindings, ctx: ExecutionContext) => {
    ctx.waitUntil(checkTripwire());
  },
};
