import { useState } from "react";
import { AppShell, GlassPanel } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { theme } from "@/lib/theme";
import { authClient } from "@/lib/auth-client";

type Step = "email" | "otp";

// Minimal email-OTP sign-in (#88) — request a code, then verify it. No
// password/OAuth (ADR 0006), so this is the only entry point into the app.
export function SignInScreen() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestOtp = async () => {
    setError(null);
    setIsSubmitting(true);
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp(
      { email, type: "sign-in" },
    );
    setIsSubmitting(false);
    if (sendError) {
      setError(sendError.message ?? "Couldn't send the code.");
      return;
    }
    setStep("otp");
  };

  const verifyOtp = async () => {
    setError(null);
    setIsSubmitting(true);
    const { error: verifyError } = await authClient.signIn.emailOtp({
      email,
      otp,
    });
    setIsSubmitting(false);
    if (verifyError) {
      setError(verifyError.message ?? "That code didn't work.");
    }
    // On success, betterauth's session signal updates useSession() itself —
    // App.tsx's gate re-renders past this screen without any callback here.
  };

  return (
    <AppShell showNav={false}>
      <h1
        className="font-display text-[1.75rem] leading-[1.05] tracking-[-0.02em]"
        style={{ color: theme.text.heading }}
      >
        Sign in to Intake
      </h1>

      <GlassPanel className="mt-6 flex flex-col gap-5">
        {step === "email" ? (
          <label className="flex flex-col gap-2">
            <span
              className="text-sm font-medium"
              style={{ color: theme.text.label }}
            >
              Email
            </span>
            <Input
              type="email"
              inputMode="email"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
        ) : (
          <label className="flex flex-col gap-2">
            <span
              className="text-sm font-medium"
              style={{ color: theme.text.label }}
            >
              Code
            </span>
            <Input
              type="text"
              inputMode="numeric"
              autoFocus
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
            />
            <span className="text-xs" style={{ color: theme.text.faint }}>
              We emailed a code to {email}.
            </span>
          </label>
        )}

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="mt-2 flex items-center justify-between gap-3">
          {step === "otp" && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStep("email");
                setOtp("");
                setError(null);
              }}
              disabled={isSubmitting}
            >
              Back
            </Button>
          )}

          <Button
            type="button"
            className={step === "email" ? "ml-auto" : ""}
            onClick={step === "email" ? requestOtp : verifyOtp}
            disabled={
              isSubmitting ||
              (step === "email" ? email.trim() === "" : otp.trim() === "")
            }
          >
            {isSubmitting
              ? "Please wait…"
              : step === "email"
                ? "Send code"
                : "Sign in"}
          </Button>
        </div>
      </GlassPanel>
    </AppShell>
  );
}
