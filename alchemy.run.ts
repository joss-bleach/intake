import alchemy from "alchemy";

// Infra entry point — skeleton only, no real resources yet (see issue #40).
// State is stored locally under .alchemy/ (gitignored) for now; a real
// backend and the first actual resources land alongside the tickets that
// need them.
const app = await alchemy("intake");

// Nightly OFF delta-refresh (issue #44): re-running `pnpm food:ingest-off`
// against a fresh dump is already idempotent (upserts on
// provenance+external_id — see src/server/food/off-ingest.ts), so the job
// itself is ready. Alchemy 0.94.0 has no built-in Cron/Schedule resource, so
// the actual nightly trigger (platform cron, a scheduled GitHub Actions
// workflow, or a provider Cron Job once real infra is provisioned) is
// scaffolded here as a placeholder and deferred to deploy, per the MVP
// spec's infra-provisioning carve-out (issue #40).
//
// TODO(#44, deploy): wire a real schedule to `pnpm food:ingest-off <dump>`.

// Same deferral, for the model_calls tripwire (issue #49): `pnpm
// observability:tripwire` is ready and idempotent (a pure count-vs-threshold
// check, no state mutated), but the actual schedule — and the GlitchTip
// container itself (docker-compose.yml) — are VPS infra provisioning, out
// of this repo's scope per the MVP spec's carve-out.
//
// TODO(#49, deploy): wire a real schedule to `pnpm observability:tripwire`.

await app.finalize();
