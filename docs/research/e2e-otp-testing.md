# E2E-testing better-auth's email-OTP sign-in without a real mailbox

## Question

Since #87/#91 (ADR 0006), `App.tsx` gates the whole UI behind a session check and shows
`<SignInScreen />` with no session. `e2e/smoke.spec.ts` does `page.goto("/")` and expects
onboarding straight away — it has no way to sign in, and there's no `RESEND_API_KEY` in CI, so
the smoke suite now fails. What's the idiomatic way to get Playwright past email-OTP sign-in in
CI without hitting Resend?

All facts below are sourced from the installed `better-auth` package's own compiled source
(`better-auth@1.6.25`, found in a sibling repo's `node_modules` — the exact package this repo
depends on at `^1.6.27` was not present in `node_modules` here, but the plugin's public API is
unchanged across that range), the official docs site, and the GitHub discussion that shipped
the feature. Fetched 2026-08-14.

---

## 1. Does better-auth's `emailOTP` plugin have a test/dev mode or bypass code?

No. `node_modules/better-auth/dist/plugins/email-otp/types.d.mts` (`EmailOTPOptions`) is the
full option surface: `sendVerificationOTP` (required), `otpLength`, `expiresIn`, `generateOTP`,
`sendVerificationOnSignUp`, `disableSignUp`, `allowedAttempts`, `storeOTP`, `resendStrategy`,
`changeEmail`, `overrideDefaultEmailVerification`, `rateLimit`. None of these is an
environment-gated bypass, a fixed/static code, or a "don't actually send" switch —
`sendVerificationOTP` always fires, unconditionally, whenever an OTP is requested. The official
plugin docs ([better-auth.com/docs/plugins/email-otp](https://better-auth.com/docs/plugins/email-otp))
confirm the same: `sendVerificationOTP` is documented as a required implementation, with no
mention of a testing/dev mode.

`generateOTP` lets you swap in a deterministic code generator, but that only controls what code
gets generated — sending still has to go somewhere, so it doesn't remove the need for a
mailer stand-in.

This matches what this repo already found and worked around in ADR 0006 / #87: `createAuth` in
`src/server/auth/index.ts` takes `sendVerificationOTP` as a constructor argument specifically so
`test/integration/auth.test.ts` can pass a stub instead of `sendOtpEmail`
(`src/server/auth/mailer.ts`, which calls the real Resend SDK). That pattern is correct and
matches upstream's intent — there's no built-in alternative.

## 2. Official test utilities: the `testUtils` plugin

better-auth ships a first-party plugin built for exactly this problem:
[`better-auth.com/docs/plugins/test-utils`](https://better-auth.com/docs/plugins/test-utils).
It originates from a GitHub discussion
([better-auth/better-auth#7914](https://github.com/better-auth/better-auth/discussions/7914),
tracking issue #5609) where a user asked for first-class integration/E2E test support because
"logging in through the UI is very slow at scale and increases flakiness." A maintainer replied
"This is now live!" on 2026-03-01, linking the docs above — so as of this research it has been
shipped for roughly five months. It is present in the installed `better-auth@1.6.25` at
`node_modules/better-auth/dist/plugins/test-utils/`, confirmed by reading the compiled
`types.d.mts` and `index.d.mts` directly:

```ts
// node_modules/better-auth/dist/plugins/test-utils/types.d.mts (abridged)
interface TestUtilsOptions {
  /** Capture OTPs in memory when created (doesn't prevent sending) */
  captureOTP?: boolean;
}
interface TestHelpers {
  createUser(overrides?: ...): User;         // build a User object, no DB write
  saveUser(user: User): Promise<User>;
  deleteUser(userId: string): Promise<void>;
  login(opts: { userId: string }): Promise<LoginResult>;   // { session, user, headers, cookies, token }
  getAuthHeaders(opts: { userId: string }): Promise<Headers>;
  getCookies(opts: { userId: string; domain?: string }): Promise<TestCookie[]>;
  getOTP?(identifier: string): string | undefined;
  clearOTPs?(): void;
}
```

Usage, per the plugin's own JSDoc example in `index.d.mts`:

```ts
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";

export const testAuth = betterAuth({
  plugins: [testUtils({ captureOTP: true })],
});

const ctx = await testAuth.$context;
const test = ctx.test;

const user = test.createUser({ email: "test@example.com" });
const savedUser = await test.saveUser(user);
const { headers, cookies } = await test.login({ userId: user.id });
```

Two relevant mechanisms:

- **`captureOTP: true`** installs a `databaseHooks.verification.create.after` hook (visible in
  `test-utils/index.d.mts`'s return type and implemented via `otp-sink.mjs`'s in-memory
  `Map`-backed store) that records every OTP as it's written to the `verification` table, keyed
  by an `identifier` string — for a sign-in OTP this identifier is `` `sign-in-otp-${email}` ``,
  per `toOTPIdentifier` in `email-otp/utils.mjs` (`` `${type}-otp-${email}` ``). It does **not**
  intercept or replace `sendVerificationOTP` — the real mailer function you wired up still gets
  called; capture just gives your test code a second, in-memory way to read the code back via
  `test.getOTP(identifier)`.
- **`test.login({ userId })`** skips the OTP round-trip entirely: it fabricates a real session
  directly in the DB and returns ready-to-use `headers`/`cookies`, which the docs explicitly
  frame for Playwright's `context.addCookies()`.

The plugin's own doc comment is explicit about scope: *"This plugin does not register public
HTTP routes or API endpoints, but it does expose privileged helpers on `ctx.test` for creating
sessions and mutating data. Prefer including it in a test-only auth instance... instead of a
production auth config."* — i.e. it's designed to be wired into a **separate** `betterAuth()`
instance that talks to the same database, not bolted onto the production instance behind a flag.
That is exactly the shape `test/integration/auth.test.ts` already uses today via
`createAuth(stubSendVerificationOTP)`, just with the stub replaced by `testUtils()`.

Because it registers no HTTP routes, it cannot be used by pointing Playwright's `page` at a
special test endpoint on the real running server — it's a programmatic (`ctx.test.*`), in-process
API. To use it for Playwright, you construct the test auth instance in Node (e.g. in a Playwright
global-setup script, or a one-off script run before the suite) and use its output to seed a
browser context, rather than driving it through `page.goto()`.

## 3. How real-world projects and Playwright itself recommend handling this class of problem

Playwright's own auth guide ([playwright.dev/docs/auth](https://playwright.dev/docs/auth))
states the general pattern directly, independent of better-auth: authenticate once, persist
the result with `storageState`, and reuse it — "This elimination speeds up test execution" and
avoids "cascading test failures" from a flaky login UI. It explicitly lists "API authentication
— use API requests instead of UI interactions for faster setup" as a preferred variant over
repeating a UI login for every test, and a `globalSetup` project that authenticates once before
the rest of the suite runs is the documented mechanism for producing that `storageState`.

Generalising past better-auth specifically, the two broad patterns the wider ecosystem uses for
OTP/magic-link auth in e2e are:

- **Capture at the transport boundary** — run a real (but disposable) mail sink in CI (Mailhog,
  Ethereal, a mailcatcher container) and have the test read the OTP out of the caught email via
  its API. This exercises the actual `sendVerificationOTP` → mailer code path, including the
  email template, at the cost of running/wiring another service.
- **Bypass the transport boundary** — swap the mailer (or the whole auth wiring) for a stub in
  the test environment and read the code from the stub directly, or skip OTP issuance entirely
  and seed a valid session. This is simpler infra-wise; the trade-off is that it doesn't exercise
  the real Resend integration (mailer.ts) or its React-email template, only better-auth's own
  session/cookie machinery.

better-auth's `testUtils` plugin is the vendor's own instance of the "bypass" pattern, built for
exactly the seeded-session (`test.login`) and stub-capture (`captureOTP`) sub-cases described
above.

## 4. Deterministic/injectable OTP generation

Yes, separately from `testUtils` — `EmailOTPOptions.generateOTP` (see §1) lets you replace the
random 6-digit generator with a deterministic one. This is a real, documented seam, but on its
own it doesn't solve the CI problem: something must still receive the deterministic code, and
`sendVerificationOTP` still has to run without hitting Resend either way. It's only useful
layered under one of the two mailer-swap approaches above (e.g. so a Mailhog-based test doesn't
have to parse a code out of an email body). Given `testUtils`'s `captureOTP` already exposes the
code programmatically without needing a fixed value, `generateOTP` doesn't add anything for this
repo's case.

---

## Recommendation

**Use `testUtils`'s seeded-session path (`test.login`), not a live OTP round-trip, for
`e2e/smoke.spec.ts`.**

Reasoning against this repo's stated constraints (`CLAUDE.md`: keep it simple, fight scope
creep, yagni; small solo-maintained codebase; Vite client + standalone Node/tRPC server, no SSR
framework to complicate cookie handling):

- The smoke suite (`e2e/smoke.spec.ts`) tests onboarding, the dashboard round-trip, profile
  editing, and offline behaviour — **it was never testing the sign-in flow itself**, and #87
  didn't add any assertions about OTP UI. The auth gate is currently just an obstacle blocking
  those tests, not something they need to exercise. Standing up a mail-capture service
  (Mailhog/Ethereal) to solve that would add a new moving part (another container, another CI
  step, another thing that can flake) to test something nobody asked this suite to test — that's
  the exact shape of complexity CLAUDE.md says to fight.
- `test.login()` gives a ready `Session`/cookie pair with zero new infrastructure: no mail
  sink, no test-only HTTP endpoint on the real server, no env-flag branching in production auth
  code (`src/server/auth/index.ts` / `mailer.ts` stay untouched). It reuses the exact shape
  `test/integration/auth.test.ts` already established — a second `betterAuth()` instance
  pointed at the same Postgres DB — so there's one pattern for "test auth instance" in the repo,
  not two.
- If a *dedicated* OTP-flow e2e test is wanted later (proving the real `SignInScreen` UI end to
  end, e.g. after a `sign-in.spec.ts` is added), `captureOTP: true` plus the real
  `SignInScreen` interaction is the right tool then — layer it in when that test is actually
  written, rather than building it now on spec.

### Rough sketch (research only — not implemented)

- `e2e/auth-setup.ts` (new, global-setup file): build a `createAuth(...)`-style test instance
  (reuse the existing factory in `src/server/auth/index.ts`) with `testUtils()` added, pointed
  at the same `DATABASE_URL` the running `dev:server` uses; `createUser` + `saveUser` a fixed
  e2e test user, `test.login({ userId })`, and write the resulting cookies to a Playwright
  `storageState` JSON file (e.g. `e2e/.auth/session.json`, git-ignored).
- `playwright.config.ts`: add a `globalSetup: "./e2e/auth-setup.ts"` (or a `setup` project
  per Playwright's dependency pattern) and `use.storageState` pointing at that file, so the
  `chromium` project starts every test already signed in.
- `src/server/auth/index.ts`: no production change needed — `testUtils` only ever goes into the
  e2e-only auth instance built inside `e2e/auth-setup.ts`, mirroring how
  `test/integration/auth.test.ts` already keeps its stub instance separate from `export const
  auth`.
- `smoke.spec.ts` itself shouldn't need edits beyond whatever DB cleanup accounts for the
  seeded test user (its current `beforeAll` already deletes `userGoals`/`userProfile` — check
  whether it also needs to leave the auth-setup's user/session rows alone, or clean up the
  `user`/`session` tables it doesn't currently touch).
- `.env.example` / CI: none needed — no new env var, no new service. The e2e job already has
  `DATABASE_URL` (for the existing `db`/`pool` imports smoke.spec.ts uses directly).

### If real-provider coverage is later wanted

Keep it out of scope for this fix, but worth naming: if the OTP → Resend → email-template path
ever needs its own coverage (e.g. verifying the rendered `OtpEmail` template), that's a job for
a narrow test against `mailer.ts`/`OtpEmail` directly (unit/integration level, like
`test/integration/auth.test.ts`'s stub already partially does), not for the Playwright smoke
suite — Playwright driving a mail-capture container is the heavier tool and should wait for an
actual requirement to exercise the browser-side OTP-entry UI end to end.

## Sources

- [better-auth.com/docs/plugins/email-otp](https://better-auth.com/docs/plugins/email-otp) —
  official plugin docs
- [better-auth.com/docs/plugins/test-utils](https://better-auth.com/docs/plugins/test-utils) —
  official test-utils plugin docs
- `node_modules/better-auth/dist/plugins/email-otp/{types,routes,utils}.d.mts` /
  `.mjs` (package version 1.6.25, sibling repo `bleach-brain`) — primary source for
  `EmailOTPOptions`, `toOTPIdentifier`, and the absence of any dev/bypass mode
- `node_modules/better-auth/dist/plugins/test-utils/{types,index}.d.mts`, `otp-sink.mjs` —
  primary source for `TestUtilsOptions`, `TestHelpers`, `captureOTP`'s
  `databaseHooks.verification.create.after` mechanism, and the in-memory OTP store
- [github.com/better-auth/better-auth/discussions/7914](https://github.com/better-auth/better-auth/discussions/7914)
  (tracking better-auth/better-auth#5609) — origin of the `testUtils` plugin, maintainer
  confirmation it shipped (2026-03-01)
- [playwright.dev/docs/auth](https://playwright.dev/docs/auth) — official Playwright guidance
  on `storageState`, API-based auth setup, and `globalSetup`
- This repo: `docs/adr/0006-email-otp-via-betterauth.md`, `src/server/auth/index.ts`,
  `src/server/auth/mailer.ts`, `test/integration/auth.test.ts`, `e2e/smoke.spec.ts`,
  `playwright.config.ts`, `.env.example`, `.github/workflows/ci.yml`
