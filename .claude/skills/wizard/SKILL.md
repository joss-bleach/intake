---
name: wizard
description: Walk the pre-production manual security checks that cannot be verified from the codebase alone — hosting config, DNS, secrets, database exposure, and error reporting. User-invoked — run it before a production launch, or after changing infrastructure.
disable-model-invocation: true
---

The security audit behind issue #98 fixed everything that lives in the repo. What is left needs a console, a DNS record, or a live request — a file cannot prove it. This skill walks those checks one at a time, records a verdict for each, and reports what still fails.

Every check below has a command or an exact console path. Run it, show the output, and state pass or fail. Never mark a check passed on the strength of what the code says: the whole point of this list is that the code cannot answer it.

## Rules

- One check at a time. Show the command and its real output before the verdict.
- A check you cannot run (no credentials, no access) is **blocked**, not passed. Say what is missing.
- Never change infrastructure to make a check pass. Report it and let Joss decide.
- Anything touching a secret: print only whether it is set and its length, never its value.

## Checks

### 1. Auth secret in production

`gh secret list --env production` and `gh variable list --env production` on `joss-bleach/intake`. Confirm `BETTER_AUTH_SECRET` exists as an environment secret.

Then confirm it is not the old placeholder. `src/server/env.ts` rejects `dev-secret-change-in-production` at boot, so a deployed Worker that serves any request has already proved this — hit `https://<APP_DOMAIN>/api/auth/get-session` and confirm a JSON response rather than a 500.

Fail here means the deploy job cannot boot. Fix before anything else.

### 2. NODE_ENV reaches the Worker

`alchemy.run.ts` binds `NODE_ENV: "production"`. Bindings are not `process.env` on every runtime, so verify the effect, not the binding.

```
curl -s -o /dev/null -w '%{http_code}\n' 'https://<APP_DOMAIN>/api/auth/error?error=x'
```

Expect a 302. A 200 means betterauth is rendering its debug HTML error page, which means `NODE_ENV` is not reaching it — and tRPC will also be attaching stack traces to error responses.

### 3. Frame-ancestors on the document

The Worker sets `frame-ancestors 'none'` on `/api/*` and `/trpc/*` responses, but it never serves the HTML document — `run_worker_first` only covers those two prefixes. `index.html` carries a `<meta>` CSP, and **`frame-ancestors` is ignored in a meta CSP**. So the document is currently frameable.

```
curl -sI 'https://<APP_DOMAIN>/' | grep -iE 'content-security-policy|x-frame-options'
```

Expect a header-borne CSP with `frame-ancestors 'none'`, or `X-Frame-Options: DENY`. If neither appears, add a Cloudflare Transform Rule (Rules → Transform Rules → Modify Response Header) on the zone that sets it for document responses. This is the one known-open item from the audit.

### 4. Other security headers on the document

Same `curl -sI`. Expect `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy`. The Worker sets these on API responses only; the asset path needs the same Transform Rule as check 3.

### 5. Database network exposure

Neon console → the `intake` project → Settings → IP Allow. Confirm whether the database accepts connections from anywhere. Hyperdrive connects from Cloudflare's network, so an allowlist is possible but needs Cloudflare's egress ranges — record the current state either way.

Also confirm the role Hyperdrive uses is not the Neon owner role if a narrower one exists.

### 6. OFF ingest credentials are least-privilege

`OFF_INGEST_DATABASE_URL` is used by the scheduled GitHub Actions ingest job. Confirm in the Neon console that its role can write `foods` and `nutrient_values` and nothing else — in particular that it cannot read `user`, `session`, or `diary_entries`. A compromised CI job should not reach user data.

### 7. Secrets never committed

```
git log --all --diff-filter=A --name-only --format='%H' -- '.env*' | head -50
git log -p --all -S 'sk-or-v1' -- . | head -20
git log -p --all -S 're_' -- . | head -20
```

Any hit means that key is public forever and must be rotated at the provider, not just removed from the tree. `.gitignore` covering it today does not undo a past commit.

### 8. Email delivery and domain auth

Resend dashboard → Domains. Confirm the sending domain is verified with SPF and DKIM records live, and that `RESEND_FROM_EMAIL` uses that domain. OTP sign-in is the only way into the app — mail landing in spam is a total outage, not a nuisance.

Send a real OTP to a fresh address and confirm it arrives in the inbox.

### 9. Error reporting is live

Confirm the GlitchTip/Sentry DSN in the deployed Worker actually receives events. Trigger a known-safe server error and check it appears in the project within a minute. A DSN that silently drops events means the audit's error-handling fixes report to nothing.

### 10. Cloudflare edge protection

Cloudflare dashboard for the zone:
- Security → WAF: managed rules enabled.
- Security → Bots: bot fight mode state recorded.
- SSL/TLS: mode is **Full (strict)**, not Flexible.
- SSL/TLS → Edge Certificates: Always Use HTTPS on, Minimum TLS Version 1.2 or higher.

### 11. Rate limiting works end to end

Two limiters landed in the audit and both need a live check, because both depend on a table that must exist in production.

- Auth: send more than 30 requests in a minute to `/api/auth/*` from one IP and confirm 429s. Confirm the `rate_limit` table has rows.
- Model calls: the per-account limiter writes `model_call_rate_limit_windows`. Confirm the table exists after deploy (`\dt` in the Neon SQL editor).

Also confirm betterauth resolves a client IP in production — the `cf-connecting-ip` header config only works behind Cloudflare. If the Worker logs "Rate limiting could not determine a client IP", every caller shares one bucket and the limit becomes a denial-of-service lever. This warning is expected locally and must not appear in production.

### 12. Backups

Neon console → the project → Backups / point-in-time restore. Record the retention window. Confirm it is long enough to notice a problem before the restore point is gone.

## Report

Finish with a table: check number, name, verdict (pass / fail / blocked), and one line of evidence. List every failure again below it with the exact next action. Do not summarise a run as clean unless all twelve are pass.
