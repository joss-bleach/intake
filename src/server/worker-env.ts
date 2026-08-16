import { env } from "cloudflare:workers";

// Bridges Hyperdrive's binding into process.env.DATABASE_URL before
// db.ts/env.ts read it. Every other var is a plain-text binding, already
// on process.env via the "node" compat preset's populate flag — this one
// object property is the exception. Import first in worker.ts.
process.env.DATABASE_URL = env.HYPERDRIVE.connectionString;
