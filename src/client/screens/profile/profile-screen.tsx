import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppShell, GlassPanel } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MacroRatioEditor } from "@/components/goals/macro-ratio-editor";
import { theme } from "@/lib/theme";
import { trpc } from "@/lib/trpc";
import { signOut } from "@/lib/auth-client";
import type { MacroPresetId } from "@/lib/macro-presets";
import type { ProteinOverrideInput } from "@/lib/router-types";

// Ongoing goal management (#45) — the same calorie/bodyweight/macro inputs
// onboarding sets once, editable any day afterward. Reuses
// MacroRatioEditor so the two flows can't drift apart on what a macro
// override looks like.
export function ProfileScreen({
  onBack,
  onSaved,
}: {
  onBack: () => void;
  onSaved: () => void;
}) {
  const goalsQuery = useQuery(trpc.goals.get.queryOptions());
  const profileQuery = useQuery(trpc.profile.get.queryOptions());

  const [calorieGoal, setCalorieGoal] = useState("");
  const [currentWeightKg, setCurrentWeightKg] = useState("");
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [preset, setPreset] = useState<MacroPresetId>("balanced");
  const [proteinOverride, setProteinOverride] =
    useState<ProteinOverrideInput>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);

  // Seeds the form from whatever's already saved, once both queries have
  // delivered data — not on every refetch, so mid-edit values aren't clobbered
  // by the query this same screen's own save triggers. Waiting for data rather
  // than for "no longer pending" matters: a failed query is also not pending,
  // and seeding from it would leave the form holding defaults that a save
  // would then write over the user's real values.
  useEffect(() => {
    if (seeded) return;
    if (goalsQuery.data === undefined || profileQuery.data === undefined) {
      return;
    }

    if (goalsQuery.data) {
      setCalorieGoal(String(goalsQuery.data.calorieGoal));
      setPreset(goalsQuery.data.macroRatio.preset);
      setProteinOverride(goalsQuery.data.macroRatio.proteinOverride);
    }
    if (profileQuery.data) {
      setCurrentWeightKg(
        profileQuery.data.currentWeightKg === null
          ? ""
          : String(profileQuery.data.currentWeightKg),
      );
      setTargetWeightKg(
        profileQuery.data.targetWeightKg === null
          ? ""
          : String(profileQuery.data.targetWeightKg),
      );
    }
    setSeeded(true);
  }, [seeded, goalsQuery.data, profileQuery.data]);

  // Bodyweight and goals go up as one transactional write, so a failure can't
  // commit half of the form (see goals.upsertWithProfile).
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

  const isSubmitting = saveMutation.isPending;

  const save = async () => {
    setSaveError(null);
    try {
      await saveMutation.mutateAsync({
        calorieGoal: Math.round(parsedCalorieGoal),
        macroRatio: { preset, proteinOverride },
        profile: {
          currentWeightKg: parsedCurrentWeight,
          targetWeightKg: parsedTargetWeight,
        },
      });
      onSaved();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Couldn't save your changes.",
      );
    }
  };

  // A failed load must not fall through to the form. Every field here is
  // write-through: rendering it unseeded would show defaults and empty weight
  // inputs, and saving that would overwrite the stored goal and clear a
  // bodyweight the user never touched. Checked as "errored with nothing
  // cached" rather than plain `isError` so a failed background refetch over
  // usable data doesn't tear down a half-edited form.
  const failedQueries = [goalsQuery, profileQuery].filter(
    (query) => query.isError && query.data === undefined,
  );

  if (failedQueries.length > 0) {
    return (
      <AppShell activeTab="profile" onProfile={onBack}>
        <GlassPanel className="mt-14 flex flex-col items-start gap-4">
          <p className="text-sm" style={{ color: theme.text.body }}>
            Couldn't load your profile: {failedQueries[0].error?.message}
          </p>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                for (const query of failedQueries) query.refetch();
              }}
            >
              Retry
            </Button>
            <Button variant="ghost" onClick={onBack}>
              Back
            </Button>
          </div>
        </GlassPanel>
      </AppShell>
    );
  }

  if (goalsQuery.isPending || profileQuery.isPending) {
    return (
      <AppShell activeTab="profile" showNav={false}>
        <p className="text-sm" style={{ color: theme.text.muted }}>
          Loading profile…
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell activeTab="profile" onProfile={onBack}>
      <h1
        className="font-display text-[1.75rem] leading-[1.05] tracking-[-0.02em]"
        style={{ color: theme.text.heading }}
      >
        Profile
      </h1>

      <GlassPanel className="mt-6 flex flex-col gap-6">
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
              onChange={(event) => setCalorieGoal(event.target.value)}
              className="max-w-[8rem]"
            />
            <span className="text-sm" style={{ color: theme.text.muted }}>
              kcal / day
            </span>
          </div>
        </label>

        <div className="flex flex-col gap-4">
          <span className="text-sm font-medium" style={{ color: theme.text.label }}>
            Bodyweight
          </span>
          <label className="flex flex-col gap-2">
            <span className="text-sm" style={{ color: theme.text.body }}>
              Current weight
            </span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={currentWeightKg}
                onChange={(event) => setCurrentWeightKg(event.target.value)}
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
                value={targetWeightKg}
                onChange={(event) => setTargetWeightKg(event.target.value)}
                className="max-w-[8rem]"
              />
              <span className="text-sm" style={{ color: theme.text.muted }}>
                kg
              </span>
            </div>
          </label>
        </div>

        <MacroRatioEditor
          preset={preset}
          proteinOverride={proteinOverride}
          onPresetChange={setPreset}
          onProteinOverrideChange={setProteinOverride}
          currentWeightKg={parsedCurrentWeight}
          targetWeightKg={parsedTargetWeight}
        />

        {saveError && (
          <p className="text-sm text-red-600" role="alert">
            {saveError}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={isSubmitting || !calorieGoalIsValid}
          >
            {isSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="self-start"
          onClick={() => signOut()}
        >
          Sign out
        </Button>
      </GlassPanel>
    </AppShell>
  );
}
