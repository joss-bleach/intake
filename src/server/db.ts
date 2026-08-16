import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "./env";
import * as schema from "./db/schema";

const { Pool } = pg;

// One pool + drizzle layer over it. The Worker calls this per request with
// Hyperdrive's connection string (Hyperdrive pools upstream, so per-request
// connect is cheap and `max` stays low per Cloudflare's guidance); everything
// else shares the process-wide singleton below.
export const createDb = (connectionString: string) => {
  const pool = new Pool({ connectionString, max: 5 });
  return { pool, db: drizzle(pool, { schema }) };
};

export type DbHandle = ReturnType<typeof createDb>;

// Workers forbid using I/O objects (pg's TCP sockets included) created in one
// request from another, so the Worker scopes a fresh handle to each
// request/cron run here — see src/server/worker.ts and issue #107.
const requestScope = new AsyncLocalStorage<DbHandle>();

export const withDb = <T>(handle: DbHandle, fn: () => T): T =>
  requestScope.run(handle, fn);

// Lazy so merely importing this module never opens a pool: the Worker bundle
// only ever uses request-scoped handles, and tests/scripts connect on first
// query. Local dev/CI point DATABASE_URL at a real Postgres
// (docker-compose.yml / CI's `postgres` service).
let singleton: DbHandle | undefined;
const current = (): DbHandle =>
  requestScope.getStore() ?? (singleton ??= createDb(env.DATABASE_URL));

// `db`/`pool` keep their original module-level API, resolved per access to
// the request-scoped handle (or the singleton) — so the many existing
// importers, better-auth's adapter included, need no threading changes.
const delegate = <T extends object>(get: () => T): T =>
  new Proxy({} as T, {
    get(_, prop) {
      const target = get();
      const value = Reflect.get(target, prop, target);
      return value instanceof Function ? value.bind(target) : value;
    },
    has: (_, prop) => Reflect.has(get(), prop),
    ownKeys: () => Reflect.ownKeys(get()),
    getOwnPropertyDescriptor: (_, prop) =>
      Reflect.getOwnPropertyDescriptor(get(), prop),
    set: (_, prop, value) => Reflect.set(get(), prop, value),
  });

// Drizzle query layer — this is what procedures/tests should use. `pool`
// stays exported for the migrator and any raw-SQL escape hatch.
export const db: DbHandle["db"] = delegate(() => current().db);
export const pool: DbHandle["pool"] = delegate(() => current().pool);

// The handle a `db.transaction(async (tx) => ...)` callback receives. Code
// that must run inside a caller-owned transaction takes this instead of `db`,
// so the transaction boundary is visible at the call site rather than hidden
// one level down.
export type Transaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
