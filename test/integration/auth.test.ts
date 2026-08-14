import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../src/server/db";
import { migrate } from "../../src/server/db/migrate";
import { createAuth } from "../../src/server/auth";

// Exercises betterauth's own request/verify/session/sign-out API directly
// (issue #87) — no HTTP layer, no UI — with a stub mailer standing in for
// Resend so the OTP is captured instead of actually emailed.
describe("email OTP sign-in (betterauth)", () => {
  let lastOtp: string | undefined;
  const auth = createAuth(async ({ otp }) => {
    lastOtp = otp;
  });

  beforeAll(async () => {
    await migrate();
  });

  afterEach(async () => {
    lastOtp = undefined;
    await pool.query('DELETE FROM "session"');
    await pool.query('DELETE FROM "verification"');
    await pool.query('DELETE FROM "user"');
  });

  afterAll(async () => {
    await pool.end();
  });

  // Set-Cookie is "name=value; Path=/; ..." — a request Cookie header only
  // wants the name=value part.
  const asCookieHeader = (setCookie: string) => setCookie.split(";")[0];

  it("signs a visitor in with the emailed code and sets a session cookie", async () => {
    await auth.api.sendVerificationOTP({
      body: { email: "visitor@example.com", type: "sign-in" },
    });
    expect(lastOtp).toMatch(/^\d+$/);

    const { headers, response } = await auth.api.signInEmailOTP({
      body: { email: "visitor@example.com", otp: lastOtp! },
      returnHeaders: true,
    });

    expect(response.user.email).toBe("visitor@example.com");
    const setCookie = headers.get("set-cookie");
    expect(setCookie).toBeTruthy();

    const session = await auth.api.getSession({
      headers: new Headers({ cookie: asCookieHeader(setCookie!) }),
    });
    expect(session?.user.email).toBe("visitor@example.com");
  });

  it("rejects an incorrect code", async () => {
    await auth.api.sendVerificationOTP({
      body: { email: "visitor@example.com", type: "sign-in" },
    });

    await expect(
      auth.api.signInEmailOTP({
        body: { email: "visitor@example.com", otp: "000000" },
      }),
    ).rejects.toThrow();
  });

  it("rejects an expired code", async () => {
    await auth.api.sendVerificationOTP({
      body: { email: "visitor@example.com", type: "sign-in" },
    });
    const otp = lastOtp!;
    // Push the stored verification's expiry into the past instead of
    // waiting out the real TTL.
    await pool.query(
      `UPDATE "verification" SET expires_at = now() - interval '1 minute'`,
    );

    await expect(
      auth.api.signInEmailOTP({ body: { email: "visitor@example.com", otp } }),
    ).rejects.toThrow();
  });

  it("sign-up is open — signing in as a new email creates the user", async () => {
    await auth.api.sendVerificationOTP({
      body: { email: "brand-new@example.com", type: "sign-in" },
    });

    const { response } = await auth.api.signInEmailOTP({
      body: { email: "brand-new@example.com", otp: lastOtp! },
      returnHeaders: true,
    });

    expect(response.user.email).toBe("brand-new@example.com");
    const [row] = await pool
      .query('SELECT email FROM "user" WHERE email = $1', [
        "brand-new@example.com",
      ])
      .then((r) => r.rows);
    expect(row.email).toBe("brand-new@example.com");
  });

  it("signing out clears the session", async () => {
    await auth.api.sendVerificationOTP({
      body: { email: "visitor@example.com", type: "sign-in" },
    });
    const { headers } = await auth.api.signInEmailOTP({
      body: { email: "visitor@example.com", otp: lastOtp! },
      returnHeaders: true,
    });
    const cookie = asCookieHeader(headers.get("set-cookie")!);

    await auth.api.signOut({ headers: new Headers({ cookie }) });

    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(session).toBeNull();
  });
});
