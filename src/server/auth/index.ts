import { betterAuth } from "better-auth";
import type { EmailOTPOptions } from "better-auth/plugins";
import { emailOTP } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import * as authSchema from "../db/auth-schema";
import { env } from "../env";
import { sendOtpEmail } from "./mailer";
import { authRateLimitStorage } from "./rate-limit-storage";

// Factory instead of a bare instance so integration tests can swap in a
// stub `sendVerificationOTP` (capturing the OTP instead of calling Resend)
// while exercising betterauth's real request/verify/session API — the seam
// this ticket's tests are built on.
export const createAuth = (
  sendVerificationOTP: EmailOTPOptions["sendVerificationOTP"],
) =>
  betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.CLIENT_ORIGIN],
    // No password, no OAuth, no SMS (ADR 0006) — email-otp is the only
    // sign-in method. Sign-up stays open: emailOTP's disableSignUp defaults
    // to false, so there's no allowlist to configure.
    emailAndPassword: { enabled: false },
    // Set explicitly rather than left to betterauth's defaults, which are
    // wrong for this deployment twice over: `enabled` defaults to
    // `NODE_ENV === "production"` (the Worker sets no NODE_ENV, so it would
    // be off), and `storage` defaults to "memory" (per-isolate on Workers,
    // so a counter resets whenever a request lands on a fresh isolate). The
    // emailOTP plugin's own per-endpoint limits ride on this same machinery
    // — without it, OTP sends and verify attempts are both uncapped.
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
      storage: "database",
      // Same database-backed semantics, one atomic upsert instead of
      // betterauth's read-then-insert (issue #115). Takes precedence over
      // `storage`, which stays as documentation of the intent.
      customStorage: authRateLimitStorage,
    },
    advanced: {
      // Without this, betterauth can't resolve a client IP and collapses
      // every caller into one shared per-path bucket — so the rate limit
      // above stops protecting accounts and starts being a denial-of-service
      // lever instead: one attacker exhausts the OTP-send bucket for
      // everybody. CF-Connecting-IP is the header Cloudflare sets, and the
      // Worker is the origin, so a client can't forge it. Falls back to the
      // shared bucket locally, where there is no proxy — correct there.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    plugins: [emailOTP({ sendVerificationOTP })],
  });

export const auth = createAuth(sendOtpEmail);
export type Auth = ReturnType<typeof createAuth>;
