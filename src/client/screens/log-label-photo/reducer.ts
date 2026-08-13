import type { LabelReading } from "@/lib/router-types";
import { anyFieldNeedsReview } from "../../../ai/label-reading";

// Reuses the server-inferred extract-mutation output type (same pattern as
// GoalsSnapshot/ProfileSnapshot in lib/router-types.ts) rather than
// importing src/ai's Effect Schema class into the client bundle.
export type ParsedLabelReading = LabelReading;

// Re-exported so both this reducer and the confirm-screen component that
// drives it can import from one place — the shared implementation lives in
// src/ai/label-reading.ts, alongside the server-side save path that also
// needs it. (Pure type-only dependency there, not the Effect runtime.)
export { anyFieldNeedsReview };

export type Unit = "serving" | "100g" | "grams";

export type Phase =
  | "idle"
  | "extracting"
  | "hard_failed"
  | "confirming"
  | "saving"
  | "saved";

export interface CapturedPhoto {
  readonly data: string;
  readonly mediaType: string;
}

export interface Session {
  readonly phase: Phase;
  readonly photo: CapturedPhoto | null;
  readonly reading: ParsedLabelReading | null;
  readonly unit: Unit;
  readonly amount: number;
  readonly error: string | null;
}

export type Action =
  | { readonly type: "CAPTURE_PHOTO"; readonly photo: CapturedPhoto }
  | { readonly type: "EXTRACT_SUCCESS"; readonly reading: ParsedLabelReading }
  | { readonly type: "CAPTURE_FAILURE"; readonly message: string }
  | { readonly type: "EXTRACT_FAILURE"; readonly message: string }
  | { readonly type: "RETAKE_PHOTO" }
  | { readonly type: "SET_UNIT"; readonly unit: Unit }
  | { readonly type: "SET_AMOUNT"; readonly amount: number }
  | { readonly type: "SAVE" }
  | { readonly type: "SAVE_SUCCESS" }
  | { readonly type: "SAVE_FAILURE"; readonly message: string };

export const initialSession = (): Session => ({
  phase: "idle",
  photo: null,
  reading: null,
  unit: "100g",
  amount: 1,
  error: null,
});

// "serving" only makes sense when the label actually printed a serving
// size — there's nothing to count servings of otherwise (basisUnit's per-100
// reading is always present, so 100g/grams are always offered).
export const availableUnits = (reading: ParsedLabelReading): readonly Unit[] =>
  reading.servingSize ? ["serving", "100g", "grams"] : ["100g", "grams"];

const defaultUnit = (reading: ParsedLabelReading): Unit =>
  reading.servingSize ? "serving" : "100g";

// Per-unit stepper starting point, mirroring the confirmed look prototype's
// AmountStepper defaults (prototype/log-label-photo-look's UNIT_CONFIG) —
// one serving, 100g flat, or the printed serving size in grams.
const defaultAmountForUnit = (unit: Unit, reading: ParsedLabelReading): number => {
  if (unit === "serving") return 1;
  if (unit === "100g") return 1;
  return reading.servingSize?.value ?? 100;
};

// Drives capture -> extracting -> confirming -> saving through the
// label-photo flow. EXTRACT_FAILURE goes straight to hard_failed with no
// further retry here — ADR 0001's retry-once-against-the-fallback-model
// policy is already exhausted server-side before this action ever fires.
export function reduce(session: Session, action: Action): Session {
  switch (action.type) {
    case "CAPTURE_PHOTO":
      if (session.phase !== "idle" && session.phase !== "hard_failed") {
        return session;
      }
      return { ...initialSession(), phase: "extracting", photo: action.photo };

    case "EXTRACT_SUCCESS": {
      if (session.phase !== "extracting") return session;
      const unit = defaultUnit(action.reading);
      return {
        ...session,
        phase: "confirming",
        reading: action.reading,
        unit,
        amount: defaultAmountForUnit(unit, action.reading),
        error: null,
      };
    }

    // The photo never became a data URL, so extraction never started —
    // same hard_failed rest state, but reachable from idle, which
    // EXTRACT_FAILURE is not.
    case "CAPTURE_FAILURE":
      if (session.phase !== "idle" && session.phase !== "hard_failed") {
        return session;
      }
      return { ...initialSession(), phase: "hard_failed", error: action.message };

    case "EXTRACT_FAILURE":
      if (session.phase !== "extracting") return session;
      return { ...session, phase: "hard_failed", error: action.message };

    case "RETAKE_PHOTO":
      if (session.phase !== "hard_failed" && session.phase !== "confirming") {
        return session;
      }
      return initialSession();

    case "SET_UNIT": {
      if (session.phase !== "confirming" || !session.reading) return session;
      return {
        ...session,
        unit: action.unit,
        amount: defaultAmountForUnit(action.unit, session.reading),
      };
    }

    case "SET_AMOUNT":
      if (session.phase !== "confirming" || action.amount <= 0) return session;
      return { ...session, amount: action.amount };

    case "SAVE":
      if (session.phase !== "confirming") return session;
      return { ...session, phase: "saving", error: null };

    case "SAVE_SUCCESS":
      if (session.phase !== "saving") return session;
      return { ...session, phase: "saved" };

    case "SAVE_FAILURE":
      if (session.phase !== "saving") return session;
      return { ...session, phase: "confirming", error: action.message };

    default:
      return session;
  }
}

// The grams (or ml, per reading.basisUnit) the current unit + amount
// resolve to — the one number totals and the eventual save payload scale
// from. `null` only for "serving" mode with no printed serving size, which
// the UI should never let happen (see availableUnits) but the reducer
// stays defensive about anyway.
export function resolveBasisAmount(session: Session): number | null {
  if (!session.reading) return null;
  if (session.unit === "serving") {
    const servingSize = session.reading.servingSize?.value;
    return servingSize ? session.amount * servingSize : null;
  }
  if (session.unit === "100g") return session.amount * 100;
  return session.amount;
}

export interface NutrientTotal {
  readonly code: string;
  readonly value: number;
  readonly unit: string;
}

// ParsedLabelReading.nutrients are per-100(g|ml) values (the label's legal
// printed baseline — see foods.basisUnit) — scaling by basisAmount/100
// converts them to the confirmed amount regardless of which unit toggle
// produced it. Display rounding (kcal to a whole number, grams to 1dp) is
// the confirm screen's job, not this pure scaling step.
export function computeTotals(
  reading: ParsedLabelReading,
  basisAmount: number,
): readonly NutrientTotal[] {
  const factor = basisAmount / 100;
  return reading.nutrients.map((nutrient) => ({
    code: nutrient.code,
    value: nutrient.value * factor,
    unit: nutrient.unit,
  }));
}
