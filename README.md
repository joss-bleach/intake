# Intake

A calorie and nutrition tracking PWA with AI-assisted logging. Describe a meal in plain English or photograph the nutrition label; Intake turns either into structured, database-backed nutrition data.

## Development

Requires Node 22+ and [pnpm](https://pnpm.io) (via `corepack enable`).

```sh
pnpm install
pnpm db:up      # starts local Postgres (docker compose)
pnpm dev        # client (Vite) on :5173, tRPC server on :3001
```

Other scripts:

- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` — [Oxlint](https://oxc.rs) (config: `.oxlintrc.json`), including the vendored [anti-slop](https://github.com/dmmulroy/anti-slop) rule plugin in `tools/oxlint/anti-slop/`
- `pnpm test` / `pnpm test:watch` — unit tests (Vitest)
- `pnpm test:e2e` — end-to-end tests (Playwright); boots the dev servers itself
- `pnpm build` — typecheck + client production build
- `pnpm observability:up` — starts a local GlitchTip instance (docker compose) for error tracking; get a project DSN from it for `GLITCHTIP_DSN`
- `pnpm observability:tripwire` — checks `model_calls` row count against `MODEL_CALLS_TRIPWIRE_THRESHOLD`, alerting via GlitchTip past it

Copy `.env.example` to `.env` to override `DATABASE_URL`/`PORT`/`GLITCHTIP_DSN`.

## Stack

React · TypeScript · Tailwind · shadcn/ui · tRPC · TanStack Query · Effect · Postgres · GlitchTip (error tracking) · Alchemy (IaC) · Playwright · GitHub Actions. See `CONTEXT.md` for domain vocabulary and `docs/adr/` for architecture decisions.

