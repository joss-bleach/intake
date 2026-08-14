// Sign-in step/email persistence (#95) — a backgrounded tab reload on
// mobile would otherwise wipe a code that's already been sent. Kept in
// sessionStorage rather than the URL, so it never leaks through browser
// history, referrers, or logs, and clears itself when the tab closes.
const STEP_KEY = "intake-sign-in-step";
const EMAIL_KEY = "intake-sign-in-email";

export type SignInStep = "email" | "otp";

export const readPersistedStep = (): SignInStep =>
  sessionStorage.getItem(STEP_KEY) === "otp" ? "otp" : "email";

export const readPersistedEmail = (): string =>
  sessionStorage.getItem(EMAIL_KEY) ?? "";

export const persistStep = (step: SignInStep) =>
  sessionStorage.setItem(STEP_KEY, step);

export const persistEmail = (email: string) =>
  sessionStorage.setItem(EMAIL_KEY, email);

// Called on successful sign-in and on sign-out, so the next visit to the
// sign-in screen starts clean instead of resuming a stale step/email.
export const clearPersistedSignIn = () => {
  sessionStorage.removeItem(STEP_KEY);
  sessionStorage.removeItem(EMAIL_KEY);
};
