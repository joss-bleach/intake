import { render } from "@react-email/render";
import { Resend } from "resend";
import { env } from "../env";
import { OtpEmail } from "./otp-email";

// The real EmailOTPOptions["sendVerificationOTP"] implementation, wired into
// betterAuth by ./index.ts. Kept separate so tests can construct their own
// auth instance (createAuth in ./index.ts) with a stub in its place instead
// of hitting Resend — see test/integration/auth.test.ts.
export const sendOtpEmail = async ({
  email,
  otp,
}: {
  email: string;
  otp: string;
}): Promise<void> => {
  const resend = new Resend(env.RESEND_API_KEY);
  const html = await render(OtpEmail({ otp }));

  // resend resolves with { error } rather than rejecting on API failures
  // (bad key, unverified domain, rate limit) — surface that as a thrown
  // error, or a bad send looks identical to a successful one.
  const { error } = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: email,
    subject: `${otp} is your Intake sign-in code`,
    html,
  });
  if (error) {
    throw new Error(`Failed to send OTP email: ${error.message}`);
  }
};
