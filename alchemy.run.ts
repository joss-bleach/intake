import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import alchemy from "alchemy";
import { Assets, Hyperdrive, Worker } from "alchemy/cloudflare";
import { NeonProject } from "alchemy/neon";
import { ClientKey, Project as SentryProject } from "alchemy/sentry";
import { CloudflareStateStore } from "alchemy/state";

// Deploy target (issue #97): one Worker serves the built SPA and /api,
// backed by Neon Postgres via Hyperdrive, errors reported to Sentry. State
// lives in a Cloudflare-hosted store (not local .alchemy/) so CI and local
// `pnpm infra:deploy` runs share it — see docs/adr/0008.
const app = await alchemy("intake", {
  stateStore: (scope) => new CloudflareStateStore(scope),
});

const APP_DOMAIN = alchemy.env("APP_DOMAIN");

// finalize() always runs, even if provisioning or the migration fails, so
// CloudflareStateStore never ends up mid-apply for the next deploy to find.
try {
  const neon = await NeonProject("db", {
    name: "intake",
    apiKey: alchemy.secret(process.env.NEON_API_KEY),
  });

  // Only Hyperdrive's connectionString reaches the Worker (see
  // src/server/worker-env.ts) — Neon's connection_uris[0] is already a
  // Secret, passed straight through as the origin.
  const hyperdrive = await Hyperdrive("db-hyperdrive", {
    origin: neon.connection_uris[0].connection_uri,
  });

  // Runs migrations against Neon directly, ahead of any Worker binding
  // existing — idempotent, so safe on every deploy (see docs/adr/0008).
  // Calls drizzle's migrator, not src/server/db/migrate: the alchemy CLI
  // loads this file with plain Node, which can't resolve app imports.
  const migrationPool = new Pool({
    connectionString: neon.connection_uris[0].connection_uri.unencrypted,
  });
  try {
    await migrate(drizzle(migrationPool), { migrationsFolder: "drizzle" });
  } finally {
    await migrationPool.end();
  }

  // The Sentry team pre-dates this deploy, so Alchemy owns the project and
  // key only and takes the team as a plain slug. Its Team resource cannot
  // adopt one anyway: adopt keys off a thrown "already exists" error, but
  // the Sentry client returns non-ok responses instead of throwing.
  const sentryProject = await SentryProject("project", {
    organization: alchemy.env("SENTRY_ORG"),
    team: alchemy.env("SENTRY_TEAM"),
    name: "intake",
    platform: "node",
    adopt: true,
  });

  const sentryKey = await ClientKey("sentry-key", {
    organization: alchemy.env("SENTRY_ORG"),
    project: sentryProject.slug!,
    name: "intake-worker",
    adopt: true,
  });

  const assets = await Assets({ path: "./dist" });

  await Worker("server", {
    name: "intake",
    entrypoint: "src/server/worker.ts",
    compatibility: "node",
    // The Worker only ever runs for API paths — everything else falls
    // through to the static SPA build, with client-side routes handled by
    // the "single-page-application" fallback.
    assets: {
      run_worker_first: ["/api/*", "/trpc/*"],
      not_found_handling: "single-page-application",
    },
    bindings: {
      ASSETS: assets,
      HYPERDRIVE: hyperdrive,
      BETTER_AUTH_SECRET: alchemy.secret(process.env.BETTER_AUTH_SECRET),
      OPENROUTER_API_KEY: alchemy.secret(process.env.OPENROUTER_API_KEY),
      RESEND_API_KEY: alchemy.secret(process.env.RESEND_API_KEY),
      RESEND_FROM_EMAIL: alchemy.env("RESEND_FROM_EMAIL"),
      GLITCHTIP_DSN: sentryKey.dsn.public,
      BETTER_AUTH_URL: `https://${APP_DOMAIN}`,
      CLIENT_ORIGIN: `https://${APP_DOMAIN}`,
    },
    // Tripwire only (issue #49) — the OFF delta-refresh (issue #44) streams
    // a multi-GB dump from disk, which doesn't fit a Worker's model; it
    // stays a scheduled GitHub Actions job (off-ingest.yml). See
    // docs/adr/0008 for the full reasoning.
    crons: ["0 3 * * *"],
    // `domains` provisions its own DnsRecords via Alchemy's CustomDomain
    // resource — no separate DnsRecords call needed (see docs/adr/0008).
    domains: [APP_DOMAIN],
  });
} finally {
  await app.finalize();
}
