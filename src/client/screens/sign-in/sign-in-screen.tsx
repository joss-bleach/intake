import { useState } from "react";
import { AppShell, GlassPanel } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { theme } from "@/lib/theme";
import { PrivacyPolicyLink } from "@/screens/privacy/privacy-screen";
import { authClient } from "@/lib/auth-client";
import {
  type SignInStep,
  readPersistedStep,
  readPersistedEmail,
  persistStep,
  persistEmail,
  clearPersistedSignIn,
} from "@/lib/sign-in-persistence";

// Minimal email-OTP sign-in (#88) — request a code, then verify it. No
// password/OAuth (ADR 0006), so this is the only entry point into the app.
export function SignInScreen({ onOpenPrivacy }: { onOpenPrivacy: () => void }) {
  // step/email persist in sessionStorage, not plain state (#95) — a
  // backgrounded tab reload on mobile would otherwise wipe a code that's
  // already been sent. `otp` stays local; the user re-checks it from their
  // inbox each time.
  const [step, setStepState] = useState(readPersistedStep);
  const [email, setEmailState] = useState(readPersistedEmail);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setStep = (next: SignInStep) => {
    persistStep(next);
    setStepState(next);
  };
  const setEmail = (next: string) => {
    persistEmail(next);
    setEmailState(next);
  };

  const requestOtp = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      });
      if (sendError) {
        setError(sendError.message ?? "Couldn't send the code.");
        return;
      }
      setStep("otp");
    } catch {
      setError("Couldn't send the code.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const { error: verifyError } = await authClient.signIn.emailOtp({
        email,
        otp,
      });
      if (verifyError) {
        setError(verifyError.message ?? "That code didn't work.");
      } else {
        clearPersistedSignIn();
      }
      // On success, betterauth's session signal updates useSession() itself —
      // App.tsx's gate re-renders past this screen without any callback here.
    } catch {
      setError("That code didn't work.");
    } finally {
      setIsSubmitting(false);
    }
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
            <InputOTP
              maxLength={6}
              inputMode="numeric"
              autoFocus
              value={otp}
              onChange={setOtp}
            >
              <InputOTPGroup>
                {Array.from({ length: 6 }, (_, index) => (
                  <InputOTPSlot key={index} index={index} />
                ))}
              </InputOTPGroup>
            </InputOTP>
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

      <PrivacyPolicyLink onClick={onOpenPrivacy} />
    </AppShell>
  );
}
