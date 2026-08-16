// Validates the Worker bundle locally, before any deploy round-trip
// (issue #107): bundles src/server/worker.ts exactly as alchemy does, then
// boots the result in workerd (via miniflare) with a real Hyperdrive binding
// pointed at the local/CI Postgres. Catches:
//  - upload-validation failures (e.g. error 10021, "disallowed operation in
//    global scope") — Cloudflare runs the script's global scope at upload;
//  - runtime init failures on the first request;
//  - cross-request I/O reuse (sequential DB-touching requests hang when a
//    socket created in one request is used from another).
// Run with `pnpm infra:validate` (Postgres must be up: `pnpm db:up` +
// `pnpm db:migrate`).
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const alchemyCloudflare = path.join(root, "node_modules/alchemy/lib/cloudflare");

const { normalizeWorkerBundle } = await import(
  path.join(alchemyCloudflare, "worker-bundle.js")
);
const { DEFAULT_COMPATIBILITY_DATE } = await import(
  path.join(alchemyCloudflare, "compatibility-date.js")
);
const { unionCompatibilityFlags } = await import(
  path.join(alchemyCloudflare, "compatibility-presets.js")
);

const outdir = path.join(root, ".alchemy/out/validate");
const compatibilityFlags = unionCompatibilityFlags("node", []);

console.log("Bundling src/server/worker.ts with alchemy's bundler...");
const bundle = normalizeWorkerBundle({
  id: "server",
  entrypoint: "src/server/worker.ts",
  cwd: root,
  compatibilityDate: DEFAULT_COMPATIBILITY_DATE,
  compatibilityFlags,
  outdir,
});
if (bundle.isErr()) {
  console.error(bundle.error);
  process.exit(1);
}
await bundle.value.create();

// miniflare isn't a direct dependency — resolve it through alchemy, which
// ships it transitively. createRequire must anchor at alchemy's real path
// inside .pnpm (not the node_modules symlink) for pnpm's layout to resolve.
const require = createRequire(
  fs.realpathSync(path.join(alchemyCloudflare, "worker-bundle.js")),
);
const { Miniflare } = await import(require.resolve("miniflare"));

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://intake:intake@localhost:5432/intake";

const mf = new Miniflare({
  modules: [
    {
      type: "ESModule",
      path: "worker.js",
      contents: fs.readFileSync(path.join(outdir, "worker.js"), "utf8"),
    },
  ],
  compatibilityDate: DEFAULT_COMPATIBILITY_DATE,
  compatibilityFlags,
  hyperdrives: { HYPERDRIVE: databaseUrl },
});

try {
  console.log("Booting the bundle in workerd (upload-validation stand-in)...");
  // Throws with Cloudflare's exact validation error (e.g. 10021) if the
  // bundle's global scope performs a disallowed operation.
  await mf.ready;

  // A cookie-less get-session short-circuits before Postgres, so sign a
  // session cookie the way better-auth does (HMAC-SHA256, dev-default
  // secret): the token doesn't exist, but verifying it forces a real DB
  // lookup per request — catching the cross-request pg-socket hang.
  const secret = "dev-secret-change-in-production";
  const token = "workerd-validation-check";
  const signature = crypto
    .createHmac("sha256", secret)
    .update(token)
    .digest("base64");
  const cookie = `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;

  for (let i = 1; i <= 4; i++) {
    const res = await mf.dispatchFetch(
      "http://worker.local/api/auth/get-session",
      { headers: { cookie } },
    );
    const body = await res.text();
    console.log(`request ${i} -> ${res.status} ${body.slice(0, 120)}`);
    if (!res.ok) {
      throw new Error(`request ${i} failed with ${res.status}: ${body}`);
    }
  }

  console.log("Worker bundle validated: clean global scope, DB requests OK.");
} finally {
  await mf.dispose();
}
