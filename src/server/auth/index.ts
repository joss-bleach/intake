import { betterAuth } from "better-auth";
import type { EmailOTPOptions } from "better-auth/plugins";
import { emailOTP } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import * as authSchema from "../db/auth-schema";
import { env } from "../env";
import { sendOtpEmail } from "./mailer";

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
    plugins: [emailOTP({ sendVerificationOTP })],
  });

export const auth = createAuth(sendOtpEmail);
export type Auth = ReturnType<typeof createAuth>;
