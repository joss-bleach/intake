import { useEffect, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { theme } from "@/lib/theme";
import { macroPresets, type MacroPresetId } from "@/lib/macro-presets";
import type { ProteinOverrideInput } from "@/lib/router-types";

const proteinPerKgRange = { min: 1.6, max: 2.2 } as const;

type ProteinMode = "preset" | "grams" | "formula";

const modeOf = (override: ProteinOverrideInput): ProteinMode => {
  if (override === null) return "preset";
  return override.type === "grams" ? "grams" : "formula";
};

// Shared by the onboarding macros step and the profile screen's goal editor
// — preset selection plus the protein-override options from #45's
// acceptance criteria (direct grams, or the 1.6–2.2 g/kg-bodyweight formula
// against whichever weight is on record). The actual ratios/derivation stay
// server-side (src/server/goals/macros.ts); this only ever produces the
// `macroRatio` input shape the server expects.
export function MacroRatioEditor({
  preset,
  proteinOverride,
  onPresetChange,
  onProteinOverrideChange,
  currentWeightKg,
  targetWeightKg,
}: {
  preset: MacroPresetId;
  proteinOverride: ProteinOverrideInput;
  onPresetChange: (preset: MacroPresetId) => void;
  onProteinOverrideChange: (override: ProteinOverrideInput) => void;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
}) {
  const mode = modeOf(proteinOverride);
  const hasAnyWeight = currentWeightKg !== null || targetWeightKg !== null;

  // A formula override pins to a specific weight source; if that weight
  // gets cleared later (bodyweight step re-checked as "skip", or the field
  // wiped on the profile screen) while this component isn't even mounted to
  // see it happen, it must fall back to the preset on remount rather than
  // silently submitting a stale override the server will reject.
  useEffect(() => {
    if (proteinOverride?.type !== "per_kg_bodyweight") return;
    const weight =
      proteinOverride.weightSource === "target"
        ? targetWeightKg
        : currentWeightKg;
    if (weight === null) {
      onProteinOverrideChange(null);
    }
  }, [proteinOverride, currentWeightKg, targetWeightKg, onProteinOverrideChange]);

  const setMode = (next: ProteinMode) => {
    if (next === "preset") {
      onProteinOverrideChange(null);
    } else if (next === "grams") {
      onProteinOverrideChange({ type: "grams", grams: 150 });
    } else {
      onProteinOverrideChange({
        type: "per_kg_bodyweight",
        gramsPerKg: 1.8,
        weightSource: currentWeightKg !== null ? "current" : "target",
      });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend
          className="mb-1 text-sm font-medium"
          style={{ color: theme.text.label }}
        >
          Macro ratio
        </legend>
        {macroPresets.map((option) => (
          <label
            key={option.id}
            className={`flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-3 transition-colors ${
              preset === option.id
                ? "border-purple-400 bg-white/70"
                : "border-white/60 bg-white/40 hover:bg-white/55"
            }`}
          >
            <span className="flex flex-col">
              <span
                className="text-sm font-medium"
                style={{ color: theme.text.body }}
              >
                {option.label}
              </span>
              <span className="text-xs" style={{ color: theme.text.muted }}>
                {option.description}
              </span>
            </span>
            <input
              type="radio"
              name="macro-preset"
              className="h-4 w-4 accent-purple-600"
              checked={preset === option.id}
              onChange={() => onPresetChange(option.id)}
            />
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend
          className="mb-1 text-sm font-medium"
          style={{ color: theme.text.label }}
        >
          Protein goal
        </legend>

        <ProteinModeOption
          active={mode === "preset"}
          label="Use the preset's protein share"
          onSelect={() => setMode("preset")}
        />
        <ProteinModeOption
          active={mode === "grams"}
          label="Set a direct gram value"
          onSelect={() => setMode("grams")}
        >
          {mode === "grams" && proteinOverride?.type === "grams" && (
            <div className="mt-2 flex items-center gap-2">
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                value={proteinOverride.grams}
                onChange={(event) =>
                  onProteinOverrideChange({
                    type: "grams",
                    grams: Number(event.target.value),
                  })
                }
                className="max-w-[7rem]"
              />
              <span className="text-sm" style={{ color: theme.text.muted }}>
                g / day
              </span>
            </div>
          )}
        </ProteinModeOption>
        <ProteinModeOption
          active={mode === "formula"}
          label={`Use ${proteinPerKgRange.min}–${proteinPerKgRange.max}g per kg of bodyweight`}
          disabled={!hasAnyWeight}
          disabledHint="Add a bodyweight on the profile screen to use this"
          onSelect={() => setMode("formula")}
        >
          {mode === "formula" && proteinOverride?.type === "per_kg_bodyweight" && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Input
                type="number"
                step={0.1}
                min={proteinPerKgRange.min}
                max={proteinPerKgRange.max}
                value={proteinOverride.gramsPerKg}
                onChange={(event) =>
                  onProteinOverrideChange({
                    ...proteinOverride,
                    gramsPerKg: Number(event.target.value),
                  })
                }
                className="max-w-[6rem]"
              />
              <span className="text-sm" style={{ color: theme.text.muted }}>
                g/kg of
              </span>
              <select
                className="h-11 rounded-xl border border-white/70 bg-white/50 px-3 text-sm"
                style={{ color: theme.text.body }}
                value={proteinOverride.weightSource}
                onChange={(event) =>
                  onProteinOverrideChange({
                    ...proteinOverride,
                    weightSource: event.target.value as "current" | "target",
                  })
                }
              >
                <option value="current" disabled={currentWeightKg === null}>
                  Current weight
                </option>
                <option value="target" disabled={targetWeightKg === null}>
                  Target weight
                </option>
              </select>
            </div>
          )}
        </ProteinModeOption>
      </fieldset>
    </div>
  );
}

function ProteinModeOption({
  active,
  label,
  disabled = false,
  disabledHint,
  onSelect,
  children,
}: {
  active: boolean;
  label: string;
  disabled?: boolean;
  disabledHint?: string;
  onSelect: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        active ? "border-purple-400 bg-white/70" : "border-white/60 bg-white/40"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <label
        className={`flex items-center gap-2 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <input
          type="radio"
          name="protein-mode"
          className="h-4 w-4 accent-purple-600"
          checked={active}
          disabled={disabled}
          onChange={onSelect}
        />
        <span className="text-sm" style={{ color: theme.text.body }}>
          {label}
        </span>
      </label>
      {disabled && disabledHint && (
        <p className="mt-1 text-xs" style={{ color: theme.text.faint }}>
          {disabledHint}
        </p>
      )}
      {children}
    </div>
  );
}
