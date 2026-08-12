import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AppShell, GlassPanel } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MacroRatioEditor } from "@/components/goals/macro-ratio-editor";
import { theme } from "@/lib/theme";
import { trpc } from "@/lib/trpc";
import type { MacroPresetId } from "@/lib/macro-presets";
import type { ProteinOverrideInput } from "@/lib/router-types";

type Step = "calories" | "bodyweight" | "macros";

const steps: readonly Step[] = ["calories", "bodyweight", "macros"];

// First-run setup (#45): calorie goal → bodyweight (skippable) → macro
// ratio, then writes both user_profile and user_goals and hands off to the
// dashboard. Each step's inputs are also independently editable later from
// the profile screen (src/client/screens/profile) via the same
// MacroRatioEditor — onboarding just sequences them once, on first run.
export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];

  const [calorieGoal, setCalorieGoal] = useState("2000");
  const [bodyweightSkipped, setBodyweightSkipped] = useState(false);
  const [currentWeightKg, setCurrentWeightKg] = useState("");
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [preset, setPreset] = useState<MacroPresetId>("balanced");
  const [proteinOverride, setProteinOverride] =
    useState<ProteinOverrideInput>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // One mutation, not a profile write followed by a goals write: the two are
  // saved in a single transaction server-side so a failure can't leave
  // bodyweight committed and goals not (see goals.upsertWithProfile).
  const saveMutation = useMutation(
    trpc.goals.upsertWithProfile.mutationOptions(),
  );

  const parsedCalorieGoal = Number(calorieGoal);
  const calorieGoalIsValid =
    calorieGoal.trim() !== "" &&
    Number.isFinite(parsedCalorieGoal) &&
    parsedCalorieGoal > 0;

  const parsedCurrentWeight = currentWeightKg.trim()
    ? Number(currentWeightKg)
    : null;
  const parsedTargetWeight = targetWeightKg.trim()
    ? Number(targetWeightKg)
    : null;

  const goNext = () => setStepIndex((index) => Math.min(index + 1, steps.length - 1));
  const goBack = () => setStepIndex((index) => Math.max(index - 1, 0));

  const finish = async () => {
    setSubmitError(null);
    try {
      await saveMutation.mutateAsync({
        calorieGoal: Math.round(parsedCalorieGoal),
        macroRatio: { preset, proteinOverride },
        profile: {
          currentWeightKg: bodyweightSkipped ? null : parsedCurrentWeight,
          targetWeightKg: bodyweightSkipped ? null : parsedTargetWeight,
        },
      });
      onComplete();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Couldn't save your goals.",
      );
    }
  };

  const isSubmitting = saveMutation.isPending;

  return (
    <AppShell showNav={false}>
      <h1
        className="font-display text-[1.75rem] leading-[1.05] tracking-[-0.02em]"
        style={{ color: theme.text.heading }}
      >
        Set up Intake
      </h1>
      <p className="mt-2 text-sm" style={{ color: theme.text.muted }}>
        Step {stepIndex + 1} of {steps.length}
      </p>

      <GlassPanel className="mt-6 flex flex-col gap-5">
        {step === "calories" && (
          <CaloriesStep
            calorieGoal={calorieGoal}
            onChange={setCalorieGoal}
          />
        )}

        {step === "bodyweight" && (
          <BodyweightStep
            currentWeightKg={currentWeightKg}
            targetWeightKg={targetWeightKg}
            skipped={bodyweightSkipped}
            onCurrentWeightChange={setCurrentWeightKg}
            onTargetWeightChange={setTargetWeightKg}
            onSkippedChange={setBodyweightSkipped}
          />
        )}

        {step === "macros" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm" style={{ color: theme.text.label }}>
              Macro goals
            </p>
            <MacroRatioEditor
              preset={preset}
              proteinOverride={proteinOverride}
              onPresetChange={setPreset}
              onProteinOverrideChange={setProteinOverride}
              currentWeightKg={bodyweightSkipped ? null : parsedCurrentWeight}
              targetWeightKg={bodyweightSkipped ? null : parsedTargetWeight}
            />
          </div>
        )}

        {submitError && (
          <p className="text-sm text-red-600" role="alert">
            {submitError}
          </p>
        )}

        <div className="mt-2 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={goBack}
            disabled={stepIndex === 0 || isSubmitting}
          >
            Back
          </Button>

          {step === "macros" ? (
            <Button type="button" onClick={finish} disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Finish setup"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={goNext}
              disabled={step === "calories" && !calorieGoalIsValid}
            >
              Continue
            </Button>
          )}
        </div>
      </GlassPanel>
    </AppShell>
  );
}

function CaloriesStep({
  calorieGoal,
  onChange,
}: {
  calorieGoal: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium" style={{ color: theme.text.label }}>
        Daily calorie goal
      </span>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          value={calorieGoal}
          onChange={(event) => onChange(event.target.value)}
          className="max-w-[8rem]"
          autoFocus
        />
        <span className="text-sm" style={{ color: theme.text.muted }}>
          kcal / day
        </span>
      </div>
      <span className="text-xs" style={{ color: theme.text.faint }}>
        You can change this any day from your profile.
      </span>
    </label>
  );
}

function BodyweightStep({
  currentWeightKg,
  targetWeightKg,
  skipped,
  onCurrentWeightChange,
  onTargetWeightChange,
  onSkippedChange,
}: {
  currentWeightKg: string;
  targetWeightKg: string;
  skipped: boolean;
  onCurrentWeightChange: (value: string) => void;
  onTargetWeightChange: (value: string) => void;
  onSkippedChange: (skipped: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: theme.text.label }}>
        Bodyweight <span style={{ color: theme.text.faint }}>(optional)</span>
      </p>

      <div className={`flex flex-col gap-4 ${skipped ? "opacity-40" : ""}`}>
        <label className="flex flex-col gap-2">
          <span className="text-sm" style={{ color: theme.text.body }}>
            Current weight
          </span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              disabled={skipped}
              value={currentWeightKg}
              onChange={(event) => onCurrentWeightChange(event.target.value)}
              className="max-w-[8rem]"
            />
            <span className="text-sm" style={{ color: theme.text.muted }}>
              kg
            </span>
          </div>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm" style={{ color: theme.text.body }}>
            Target weight
          </span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              disabled={skipped}
              value={targetWeightKg}
              onChange={(event) => onTargetWeightChange(event.target.value)}
              className="max-w-[8rem]"
            />
            <span className="text-sm" style={{ color: theme.text.muted }}>
              kg
            </span>
          </div>
        </label>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 accent-purple-600"
          checked={skipped}
          onChange={(event) => onSkippedChange(event.target.checked)}
        />
        <span className="text-sm" style={{ color: theme.text.muted }}>
          Skip for now — I'll add this later
        </span>
      </label>
    </div>
  );
}
