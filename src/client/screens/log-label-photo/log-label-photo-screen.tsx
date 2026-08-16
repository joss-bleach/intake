import { useReducer, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Beef, Camera, Check, Droplet, Pencil, Sparkles, Wheat, X } from "lucide-react";
import { AppShell, GlassPanel } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { theme, reviewBadgeClass, confidentDotClass } from "@/lib/theme";
import { trpc } from "@/lib/trpc";
import { OFFLINE_LOG_MESSAGE, useOnlineStatus } from "@/lib/offline";
import {
  isSupportedImageMediaType,
  type SupportedImageMediaType,
} from "../../../ai/image-media-types";
import {
  availableUnits,
  computeTotals,
  describeForHandoff,
  initialSession,
  isIncompleteReading,
  reduce,
  resolveBasisAmount,
  type CorrectionScope,
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

// "Serving (1 slice · 30g)" when the label printed a discrete-unit
// descriptor, else the plain weight — a bare "Serving (30g)" reads as
// unclear for discrete items like bread slices (issue #80).
const servingLabel = (reading: ParsedLabelReading): string => {
  const weight = `${reading.servingSize?.value}${reading.basisUnit}`;
  const descriptor = reading.servingSizeDescriptor?.value;
  return descriptor ? `Serving (${descriptor} · ${weight})` : `Serving (${weight})`;
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
function readPhoto(
  file: File,
): Promise<{ data: string; mediaType: SupportedImageMediaType }> {
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
      // `accept="image/*"` still lets a device hand back something the
      // vision model can't read (a TIFF, an AVIF). Caught here so the user
      // sees "try a different photo" rather than a validation error from
      // the extract mutation, which rejects the same list.
      if (!isSupportedImageMediaType(match[1])) {
        reject(new Error("That image format isn't supported — try a photo."));
        return;
      }
      resolve({ mediaType: match[1], data: match[2] });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Photograph a nutrition label, confirm the serving amount, save — the
 * confident-case flow (issue #47) plus corrections and the incomplete-read
 * handoff (issue #51). Capture uses a plain `<input capture>` rather than a
 * live getUserMedia stream: simpler, and the acceptance criteria names
 * either as acceptable.
 */
export function LogLabelPhotoScreen({
  onDiscard,
  onSaved,
  onIncompleteRead,
}: {
  onDiscard: () => void;
  onSaved: () => void;
  // A successful-but-incomplete read (issue #51) — the caller switches to
  // the description path with this as its starting text, rather than this
  // screen ever showing a confirm view for it.
  onIncompleteRead: (initialDescription: string) => void;
}) {
  const [session, dispatch] = useReducer(reduce, undefined, initialSession);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const online = useOnlineStatus();

  const extractMutation = useMutation(trpc.labelPhoto.extract.mutationOptions());
  const saveMutation = useMutation(trpc.labelPhoto.save.mutationOptions());
  const correctInstanceMutation = useMutation(trpc.labelPhoto.correctInstance.mutationOptions());
  const correctFoodMutation = useMutation(trpc.labelPhoto.correctFood.mutationOptions());

  const handleFile = async (file: File) => {
    let photo;
    // Reading the file can fail on its own (an unreadable file, an
    // unexpected data URL) before there is anything to extract — that has to
    // show a capture error, not leave the screen sitting idle.
    try {
      photo = await readPhoto(file);
    } catch (error) {
      dispatch({
        type: "CAPTURE_FAILURE",
        message:
          error instanceof Error ? error.message : "Couldn't read that photo.",
      });
      return;
    }

    dispatch({ type: "CAPTURE_PHOTO", photo });
    try {
      const reading = await extractMutation.mutateAsync({
        photoBase64: photo.data,
        mediaType: photo.mediaType,
      });

      // A decodable-but-incomplete read (no energy_kcal) never reaches the
      // confirm screen — hand off to the description path with whatever was
      // extracted, no tap required, and no food-database fallback of our
      // own (the description path's own resolveFood call is the only
      // lookup that happens from here).
      if (isIncompleteReading(reading)) {
        dispatch({ type: "EXTRACT_INCOMPLETE" });
        onIncompleteRead(describeForHandoff(reading));
        return;
      }

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
    if (!reading || basisAmount === null || !online) return;

    dispatch({ type: "SAVE" });
    try {
      const entry = await saveMutation.mutateAsync({
        reading,
        quantity: session.unit === "serving" ? session.amount : basisAmount,
        quantityUnit: session.unit === "serving" ? "serving" : reading.basisUnit,
      });
      dispatch({ type: "SAVE_SUCCESS", entry });
    } catch (error) {
      dispatch({
        type: "SAVE_FAILURE",
        message: error instanceof Error ? error.message : "Couldn't save that entry.",
      });
    }
  };

  const saveCorrection = async () => {
    const reading = session.reading;
    const entry = session.savedEntry;
    const basisAmount = resolveBasisAmount(session);
    if (!reading || !entry || basisAmount === null) return;

    dispatch({ type: "SAVE_CORRECTION" });
    const amount = {
      quantity: session.unit === "serving" ? session.amount : basisAmount,
      quantityUnit: session.unit === "serving" ? "serving" : reading.basisUnit,
    } as const;

    try {
      if (session.correctionScope === "instance") {
        const result = await correctInstanceMutation.mutateAsync({
          originalLoggedItemId: entry.loggedItemId,
          reading,
          ...amount,
          editedNutrientCodes: session.editedNutrientCodes,
        });
        dispatch({
          type: "CORRECTION_SUCCESS",
          scope: "instance",
          loggedItemId: result.loggedItemId,
        });
      } else {
        await correctFoodMutation.mutateAsync({
          foodId: entry.foodId,
          reading,
          editedNutrientCodes: session.editedNutrientCodes,
        });
        dispatch({ type: "CORRECTION_SUCCESS", scope: "food" });
      }
    } catch (error) {
      dispatch({
        type: "CORRECTION_FAILURE",
        message: error instanceof Error ? error.message : "Couldn't save that correction.",
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
          online={online}
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
            online={online}
            onUnitChange={(unit) => dispatch({ type: "SET_UNIT", unit })}
            onAmountChange={(amount) => dispatch({ type: "SET_AMOUNT", amount })}
            onEditFoodName={(name) => dispatch({ type: "EDIT_FOOD_NAME", name })}
            onEditBrand={(value) => dispatch({ type: "EDIT_BRAND", value })}
            onEditNutrient={(code, value) => dispatch({ type: "EDIT_NUTRIENT", code, value })}
            onRetake={retake}
            onDiscard={onDiscard}
            onSave={save}
          />
        )}

      {(session.phase === "saved" || session.phase === "correcting") &&
        session.reading && (
          <SavedView
            reading={session.reading}
            basisAmount={resolveBasisAmount(session) ?? 0}
            error={session.error}
            correcting={session.phase === "correcting"}
            dirty={session.dirty}
            correctionScope={session.correctionScope}
            instanceCorrected={session.instanceCorrected}
            onEditNutrient={(code, value) => dispatch({ type: "EDIT_NUTRIENT", code, value })}
            onScopeChange={(scope) => dispatch({ type: "SET_CORRECTION_SCOPE", scope })}
            onSaveCorrection={saveCorrection}
            onDone={onSaved}
          />
        )}

      {session.toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 flex justify-center px-4">
          <Toast message={session.toast} onDismiss={() => dispatch({ type: "DISMISS_TOAST" })} />
        </div>
      )}
    </AppShell>
  );
}

function CaptureView({
  error,
  online,
  onCapture,
  onCancel,
}: {
  error: string | null;
  online: boolean;
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
      {!online && (
        <p className="max-w-xs text-sm" style={{ color: theme.text.faint }} role="alert">
          {OFFLINE_LOG_MESSAGE}
        </p>
      )}
      {error && (
        <p className="max-w-xs text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onCapture}
        disabled={!online}
        aria-label="Take photo"
        className={`grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br ${theme.navButtonGradient} text-white shadow-lg transition-transform active:scale-95 disabled:opacity-50`}
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

// Tap-to-edit affordance shared by the food name/brand and every nutrient
// value (issue #51's "one-tap correction") — click into a plain text input,
// commit on blur/Enter, discard on Escape. Mirrors amount-stepper.tsx's
// editing mechanics, generalized to any string value rather than a
// stepped numeric amount.
function EditableValue({
  value,
  onCommit,
  ariaLabel,
  className,
  inputMode = "text",
  showPencil = false,
}: {
  value: string;
  onCommit: (raw: string) => void;
  ariaLabel: string;
  className?: string;
  inputMode?: "text" | "decimal";
  showPencil?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onCommit(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        inputMode={inputMode}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
        aria-label={ariaLabel}
        className={`rounded-lg bg-white text-right tabular-nums ring-1 ring-inset ring-black/10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className ?? ""}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      aria-label={ariaLabel}
      className={`rounded-lg text-right transition-colors hover:bg-white/60 ${className ?? ""}`}
    >
      <span className="inline-flex items-center gap-1">
        {value}
        {showPencil && <Pencil className="h-3 w-3 shrink-0 opacity-40" aria-hidden="true" />}
      </span>
    </button>
  );
}

// One nutrient row: label + confidence badge on the left, the tappable
// scaled value on the right. Shared by ConfirmView and SavedView so a
// correction edits the same control the confirm screen already showed.
// `basisAmount` converts between the per-100(g|ml) value the reading
// actually stores and the scaled total shown/edited here.
function NutrientRow({
  code,
  reading,
  basisAmount,
  onEditNutrient,
}: {
  code: string;
  reading: ParsedLabelReading;
  basisAmount: number;
  onEditNutrient: (code: string, value: number) => void;
}) {
  const nutrient = reading.nutrients.find((n) => n.code === code);
  if (!nutrient) return null;
  const factor = basisAmount / 100;
  const scaledValue = nutrient.value * factor;

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-1.5" style={{ color: theme.text.label }}>
        {nutrientLabel(code)}
        {nutrient.confidence === "needs_review" && (
          <span className={reviewBadgeClass}>
            <Sparkles className="h-2.5 w-2.5" /> estimated
          </span>
        )}
        {nutrient.confidence === "confident" && (
          <Check className={`h-3 w-3 ${confidentDotClass}`} aria-hidden="true" />
        )}
      </span>
      <span className="flex items-center gap-1 tabular-nums" style={{ color: theme.text.heading }}>
        <EditableValue
          value={String(Math.round(scaledValue * 10) / 10)}
          inputMode="decimal"
          ariaLabel={`Edit ${nutrientLabel(code)}`}
          className="w-16"
          onCommit={(raw) => {
            const parsed = Number(raw);
            if (!Number.isFinite(parsed) || parsed < 0 || factor === 0) return;
            onEditNutrient(code, parsed / factor);
          }}
        />
        {nutrient.unit}
      </span>
    </div>
  );
}

// Editable name/brand (issue #51) — pre-save only, since a name/brand
// correction has nowhere to persist once the log is saved (see reducer.ts's
// nameEditable). SavedView shows the same two lines read-only instead.
function EditableFoodHeader({
  reading,
  onEditFoodName,
  onEditBrand,
}: {
  reading: ParsedLabelReading;
  onEditFoodName: (name: string) => void;
  onEditBrand: (value: string) => void;
}) {
  return (
    <div>
      <EditableValue
        value={reading.foodName}
        ariaLabel="Edit food name"
        className="font-display text-2xl leading-tight text-left"
        onCommit={onEditFoodName}
        showPencil
      />
      <EditableValue
        value={reading.brand?.value ?? "Add a brand"}
        ariaLabel="Edit brand"
        className="block text-sm text-left"
        onCommit={onEditBrand}
        showPencil
      />
    </div>
  );
}

// The tappable nutrient list, shared by ConfirmView and SavedView so a
// correction edits the same control the confirm screen already showed.
function NutrientPanel({
  reading,
  basisAmount,
  onEditNutrient,
}: {
  reading: ParsedLabelReading;
  basisAmount: number;
  onEditNutrient: (code: string, value: number) => void;
}) {
  const totals = computeTotals(reading, basisAmount);
  return (
    <GlassPanel className="flex flex-col gap-3">
      {totals.map((t) => (
        <NutrientRow
          key={t.code}
          code={t.code}
          reading={reading}
          basisAmount={basisAmount}
          onEditNutrient={onEditNutrient}
        />
      ))}
    </GlassPanel>
  );
}

function ConfirmView({
  reading,
  unit,
  amount,
  basisAmount,
  error,
  saving,
  online,
  onUnitChange,
  onAmountChange,
  onEditFoodName,
  onEditBrand,
  onEditNutrient,
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
  online: boolean;
  onUnitChange: (unit: Unit) => void;
  onAmountChange: (amount: number) => void;
  onEditFoodName: (name: string) => void;
  onEditBrand: (value: string) => void;
  onEditNutrient: (code: string, value: number) => void;
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
      <EditableFoodHeader reading={reading} onEditFoodName={onEditFoodName} onEditBrand={onEditBrand} />

      <NutrientPanel reading={reading} basisAmount={basisAmount} onEditNutrient={onEditNutrient} />

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
        label={unit === "serving" ? servingLabel(reading) : "Amount"}
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

      {!online && (
        <p className="text-sm" style={{ color: theme.text.faint }} role="alert">
          {OFFLINE_LOG_MESSAGE}
        </p>
      )}

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
            disabled={saving || !online}
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

// Shown once the entry is saved (issue #51): the same tap-to-edit fields as
// ConfirmView, plus the two correction scopes. Choosing a scope only
// matters once something's actually been edited (`dirty`) — the toggle
// stays hidden until then so a freshly-saved, untouched entry reads exactly
// like #47's plain "saved" state.
function SavedView({
  reading,
  basisAmount,
  error,
  correcting,
  dirty,
  correctionScope,
  instanceCorrected,
  onEditNutrient,
  onScopeChange,
  onSaveCorrection,
  onDone,
}: {
  reading: ParsedLabelReading;
  basisAmount: number;
  error: string | null;
  correcting: boolean;
  dirty: boolean;
  correctionScope: CorrectionScope;
  instanceCorrected: boolean;
  onEditNutrient: (code: string, value: number) => void;
  onScopeChange: (scope: CorrectionScope) => void;
  onSaveCorrection: () => void;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <p className="text-sm" style={{ color: theme.text.body }}>
          Saved
          {/* Quiet persistent indicator (issue #51) for an instance-level
              correction — deliberately plain text, not a badge, so it never
              reads as another needs_review nudge. */}
          {instanceCorrected && (
            <span className="ml-2" style={{ color: theme.text.faint }}>
              · corrected for this log
            </span>
          )}
        </p>
        {/* Read-only here (unlike ConfirmView's EditableFoodHeader) — a
            name/brand correction has nowhere to persist post-save. */}
        <p className="font-display text-2xl leading-tight" style={{ color: theme.text.heading }}>
          {reading.foodName}
        </p>
        {reading.brand?.value && (
          <p className="text-sm" style={{ color: theme.text.faint }}>
            {reading.brand.value}
          </p>
        )}
      </div>

      <NutrientPanel reading={reading} basisAmount={basisAmount} onEditNutrient={onEditNutrient} />

      {dirty && (
        <GlassPanel className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: theme.text.label }}>
            Apply this correction to
          </p>
          <div className="flex gap-1 rounded-full bg-white/50 p-1 ring-1 ring-inset ring-white/70">
            <button
              type="button"
              onClick={() => onScopeChange("instance")}
              className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-colors ${
                correctionScope === "instance" ? "bg-white shadow-sm" : ""
              }`}
              style={{ color: correctionScope === "instance" ? theme.text.heading : theme.text.faint }}
            >
              Just this log
            </button>
            <button
              type="button"
              onClick={() => onScopeChange("food")}
              className={`flex-1 rounded-full py-1.5 text-xs font-medium transition-colors ${
                correctionScope === "food" ? "bg-white shadow-sm" : ""
              }`}
              style={{ color: correctionScope === "food" ? theme.text.heading : theme.text.faint }}
            >
              This product, going forward
            </button>
          </div>
          <Button onClick={onSaveCorrection} disabled={correcting}>
            {correcting ? "Saving correction…" : "Save correction"}
          </Button>
        </GlassPanel>
      )}

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      <Button className="mt-auto" onClick={onDone} disabled={correcting}>
        Done
      </Button>
    </div>
  );
}
