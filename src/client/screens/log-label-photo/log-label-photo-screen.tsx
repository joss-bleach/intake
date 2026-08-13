import { useReducer, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Beef, Camera, Check, Droplet, Sparkles, Wheat, X } from "lucide-react";
import { AppShell, GlassPanel } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { theme, reviewBadgeClass, confidentDotClass } from "@/lib/theme";
import { trpc } from "@/lib/trpc";
import {
  availableUnits,
  computeTotals,
  initialSession,
  reduce,
  resolveBasisAmount,
  type ParsedLabelReading,
  type Unit,
} from "./reducer";
import { AmountStepper } from "./amount-stepper";

// Display labels for the fixed nutrient vocabulary (nutrient-codes.ts,
// server-only) — duplicated as literals rather than importing the
// server-side module, since the client only needs the display copy, not
// the value/unit source of truth those codes back.
const NUTRIENT_LABELS = {
  energy_kcal: "Energy",
  protein_g: "Protein",
  carbohydrate_g: "Carbs",
  sugars_g: "Sugars",
  fat_g: "Fat",
  saturated_fat_g: "Saturates",
  fibre_g: "Fibre",
  salt_g: "Salt",
} satisfies Record<string, string>;

const nutrientLabel = (code: string) =>
  code in NUTRIENT_LABELS
    ? NUTRIENT_LABELS[code as keyof typeof NUTRIENT_LABELS]
    : code.replace(/_/g, " ");

const MACRO_ICONS = {
  protein_g: Beef,
  carbohydrate_g: Wheat,
  fat_g: Droplet,
} satisfies Record<string, typeof Beef>;

const macroIcon = (code: string) =>
  code in MACRO_ICONS ? MACRO_ICONS[code as keyof typeof MACRO_ICONS] : Beef;

// Labels and stepper formatting both key off the label's own basisUnit
// ("g" or "ml") rather than assuming grams — a liquid product (milk,
// juice, sauce) extracts as "ml", and the toggle/stepper must say so.
const unitToggleLabel = (unit: Unit, basisUnit: "g" | "ml"): string => {
  if (unit === "serving") return "Serving";
  if (unit === "100g") return `100${basisUnit}`;
  return basisUnit === "ml" ? "Millilitres" : "Grams";
};

const stepperConfigFor = (basisUnit: "g" | "ml") =>
  ({
    serving: { step: 0.5, min: 0.5, format: (v: number) => `${v}` },
    "100g": { step: 0.5, min: 0.5, format: (v: number) => `${Math.round(v * 100)}${basisUnit}` },
    grams: { step: 10, min: 10, format: (v: number) => `${v}${basisUnit}` },
  }) satisfies Record<Unit, { step: number; min: number; format: (v: number) => string }>;

// Reads a File as a data URL, then splits it into the base64 payload and
// media type the server's extract mutation expects — the same split the
// input's own "data:image/jpeg;base64,..." URL already carries.
function readPhoto(file: File): Promise<{ data: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read that photo."));
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
      if (!match) {
        reject(new Error("Unexpected photo format."));
        return;
      }
      resolve({ mediaType: match[1], data: match[2] });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Photograph a nutrition label, confirm the serving amount, save — the
 * confident-case flow (issue #47). Capture uses a plain
 * `<input capture>` rather than a live getUserMedia stream: simpler, and
 * the acceptance criteria names either as acceptable.
 */
export function LogLabelPhotoScreen({
  onDiscard,
  onSaved,
}: {
  onDiscard: () => void;
  onSaved: () => void;
}) {
  const [session, dispatch] = useReducer(reduce, undefined, initialSession);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractMutation = useMutation(trpc.labelPhoto.extract.mutationOptions());
  const saveMutation = useMutation(trpc.labelPhoto.save.mutationOptions());

  const handleFile = async (file: File) => {
    const photo = await readPhoto(file);
    dispatch({ type: "CAPTURE_PHOTO", photo });
    try {
      const reading = await extractMutation.mutateAsync({
        photoBase64: photo.data,
        mediaType: photo.mediaType,
      });
      dispatch({ type: "EXTRACT_SUCCESS", reading });
    } catch (error) {
      dispatch({
        type: "EXTRACT_FAILURE",
        message:
          error instanceof Error
            ? error.message
            : "Couldn't read that label — try a clearer photo.",
      });
    }
  };

  const retake = () => {
    dispatch({ type: "RETAKE_PHOTO" });
    fileInputRef.current?.click();
  };

  const save = async () => {
    const reading = session.reading;
    const basisAmount = resolveBasisAmount(session);
    if (!reading || basisAmount === null) return;

    dispatch({ type: "SAVE" });
    try {
      await saveMutation.mutateAsync({
        reading,
        quantity: session.unit === "serving" ? session.amount : basisAmount,
        quantityUnit: session.unit === "serving" ? "serving" : reading.basisUnit,
      });
      dispatch({ type: "SAVE_SUCCESS" });
      onSaved();
    } catch (error) {
      dispatch({
        type: "SAVE_FAILURE",
        message: error instanceof Error ? error.message : "Couldn't save that entry.",
      });
    }
  };

  return (
    <AppShell showNav={false}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />

      {(session.phase === "idle" || session.phase === "hard_failed") && (
        <CaptureView
          error={session.phase === "hard_failed" ? session.error : null}
          onCapture={() => fileInputRef.current?.click()}
          onCancel={onDiscard}
        />
      )}

      {session.phase === "extracting" && <ExtractingView />}

      {(session.phase === "confirming" || session.phase === "saving") &&
        session.reading && (
          <ConfirmView
            reading={session.reading}
            unit={session.unit}
            amount={session.amount}
            // Computed once here via the reducer's own resolveBasisAmount,
            // not re-derived inline — the save payload above and the
            // totals shown below must never disagree on this number.
            basisAmount={resolveBasisAmount(session) ?? 0}
            error={session.error}
            saving={session.phase === "saving"}
            onUnitChange={(unit) => dispatch({ type: "SET_UNIT", unit })}
            onAmountChange={(amount) => dispatch({ type: "SET_AMOUNT", amount })}
            onRetake={retake}
            onDiscard={onDiscard}
            onSave={save}
          />
        )}
    </AppShell>
  );
}

function CaptureView({
  error,
  onCapture,
  onCancel,
}: {
  error: string | null;
  onCapture: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <p className="font-display text-2xl" style={{ color: theme.text.heading }}>
        Log by label photo
      </p>
      <p className="max-w-xs text-sm" style={{ color: theme.text.body }}>
        Photograph the nutrition panel on the back of the pack.
      </p>
      {error && (
        <p className="max-w-xs text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onCapture}
        aria-label="Take photo"
        className={`grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br ${theme.navButtonGradient} text-white shadow-lg transition-transform active:scale-95`}
      >
        <Camera className="h-6 w-6" strokeWidth={2.25} />
      </button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function ExtractingView() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm" style={{ color: theme.text.body }}>
        Reading the label…
      </p>
    </div>
  );
}

function ConfirmView({
  reading,
  unit,
  amount,
  basisAmount,
  error,
  saving,
  onUnitChange,
  onAmountChange,
  onRetake,
  onDiscard,
  onSave,
}: {
  reading: ParsedLabelReading;
  unit: Unit;
  amount: number;
  basisAmount: number;
  error: string | null;
  saving: boolean;
  onUnitChange: (unit: Unit) => void;
  onAmountChange: (amount: number) => void;
  onRetake: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const totals = computeTotals(reading, basisAmount);
  const energy = totals.find((t) => t.code === "energy_kcal");
  const macros = (["protein_g", "carbohydrate_g", "fat_g"] as const)
    .map((code) => totals.find((t) => t.code === code))
    .filter((t): t is NonNullable<typeof t> => t !== undefined);

  const units = availableUnits(reading);
  const stepperConfig = stepperConfigFor(reading.basisUnit);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <p className="font-display text-2xl leading-tight" style={{ color: theme.text.heading }}>
          {reading.foodName}
        </p>
        {reading.brand && (
          <p className="text-sm" style={{ color: theme.text.faint }}>
            {reading.brand.value}
          </p>
        )}
      </div>

      <GlassPanel className="flex flex-col gap-3">
        {totals.map((t) => {
          const nutrient = reading.nutrients.find((n) => n.code === t.code);
          return (
            <div key={t.code} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5" style={{ color: theme.text.label }}>
                {nutrientLabel(t.code)}
                {nutrient?.confidence === "needs_review" && (
                  <span className={reviewBadgeClass}>
                    <Sparkles className="h-2.5 w-2.5" /> estimated
                  </span>
                )}
                {nutrient?.confidence === "confident" && (
                  <Check className={`h-3 w-3 ${confidentDotClass}`} aria-hidden="true" />
                )}
              </span>
              <span className="tabular-nums" style={{ color: theme.text.heading }}>
                {Math.round(t.value * 10) / 10}
                {t.unit}
              </span>
            </div>
          );
        })}
      </GlassPanel>

      {units.length > 1 && (
        <div className="flex gap-1 rounded-full bg-white/50 p-1 ring-1 ring-inset ring-white/70">
          {units.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => onUnitChange(u)}
              className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-colors ${
                unit === u ? "bg-white shadow-sm" : ""
              }`}
              style={{ color: unit === u ? theme.text.heading : theme.text.faint }}
            >
              {unitToggleLabel(u, reading.basisUnit)}
            </button>
          ))}
        </div>
      )}

      <AmountStepper
        label={unit === "serving" ? `Serving (${reading.servingSize?.value}${reading.basisUnit})` : "Amount"}
        value={amount}
        step={stepperConfig[unit].step}
        min={stepperConfig[unit].min}
        format={stepperConfig[unit].format}
        onChange={onAmountChange}
      />

      <GlassPanel>
        <p className="text-sm" style={{ color: theme.text.label }}>
          Total
        </p>
        <p className="mt-1 font-display text-5xl leading-none" style={{ color: theme.text.heading }}>
          {energy ? Math.round(energy.value) : "—"}
          <span className="ml-2 font-sans text-lg font-normal" style={{ color: theme.text.suffixLight }}>
            kcal
          </span>
        </p>
        {!energy && (
          <p className="mt-1 text-xs" style={{ color: theme.text.faint }}>
            No energy value was on the panel — this is missing, not zero.
          </p>
        )}
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {macros.map((m) => {
            const Icon = macroIcon(m.code);
            return (
              <div
                key={m.code}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/50 py-3 ring-1 ring-inset ring-white/70"
              >
                <Icon className="h-4 w-4" style={{ color: theme.text.body }} strokeWidth={2.25} />
                <span className="text-sm tabular-nums" style={{ color: theme.text.heading }}>
                  {Math.round(m.value * 10) / 10}g
                </span>
              </div>
            );
          })}
        </div>
      </GlassPanel>

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={onRetake} disabled={saving}>
          Retake
        </Button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Discard"
            onClick={onDiscard}
            disabled={saving}
            className="grid h-11 w-11 place-items-center rounded-full bg-white/70 ring-1 ring-inset ring-white/80 backdrop-blur-xl transition-transform active:scale-95 disabled:opacity-50"
            style={{ color: theme.text.faint }}
          >
            <X className="h-4.5 w-4.5" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className={`flex h-11 items-center gap-1.5 rounded-full bg-gradient-to-br ${theme.navButtonGradient} px-5 text-sm font-medium text-white transition-transform active:scale-95 disabled:opacity-50`}
          >
            <Check className="h-4 w-4" strokeWidth={2.5} />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
