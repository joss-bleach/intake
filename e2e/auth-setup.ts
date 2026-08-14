import path from "node:path";
import fs from "node:fs/promises";
import { betterAuth } from "better-auth";
import { emailOTP, testUtils } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, pool } from "../src/server/db";
import * as authSchema from "../src/server/db/auth-schema";
import { env } from "../src/server/env";

// Seeds a signed-in storageState via better-auth's testUtils plugin
// (test.login), instead of driving the real OTP flow per test — see
// docs/research/e2e-otp-testing.md. Production auth is untouched.
export const STORAGE_STATE_PATH = path.join(import.meta.dirname, ".auth/session.json");
const TEST_USER_EMAIL = "e2e@example.com";

export default async function globalSetup() {
  const testAuth = betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.CLIENT_ORIGIN],
    emailAndPassword: { enabled: false },
    plugins: [emailOTP({ sendVerificationOTP: async () => {} }), testUtils()],
  });

  const ctx = await testAuth.$context;
  // Reuse the seeded user across runs against a persistent local DB — the
  // `email` column is unique, so a second saveUser() would throw.
  const existingUser = await ctx.internalAdapter.findUserByEmail(TEST_USER_EMAIL);
  const savedUser =
    existingUser?.user ?? (await ctx.test.saveUser(ctx.test.createUser({ email: TEST_USER_EMAIL })));
  const { cookies } = await ctx.test.login({ userId: savedUser.id });

  await fs.mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await fs.writeFile(
    STORAGE_STATE_PATH,
    JSON.stringify({
      cookies: cookies.map((cookie) => ({
        ...cookie,
        sameSite: cookie.sameSite ?? "Lax",
        expires: cookie.expires ?? -1,
      })),
      origins: [],
    }),
  );

  await pool.end();
}
