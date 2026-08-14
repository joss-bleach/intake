import type { LabelReading } from "@/lib/router-types";
import { anyFieldNeedsReview, isIncompleteReading } from "../../../ai/label-reading";

// Reuses the server-inferred extract-mutation output type (same pattern as
// GoalsSnapshot/ProfileSnapshot in lib/router-types.ts) rather than
// importing src/ai's Effect Schema class into the client bundle.
export type ParsedLabelReading = LabelReading;

// Re-exported so both this reducer and the confirm-screen component that
// drives it can import from one place — the shared implementation lives in
// src/ai/label-reading.ts, alongside the server-side save path that also
// needs it. (Pure type-only dependency there, not the Effect runtime.)
export { anyFieldNeedsReview, isIncompleteReading };

export type Unit = "serving" | "100g" | "grams";

// "correcting" is a post-save mutation in flight (issue #51) — distinct from
// "saving", the original confirm -> save transition, so SAVE_SUCCESS and
// CORRECTION_SUCCESS can never be confused about which write they're
// finishing.
export type Phase =
  | "idle"
  | "extracting"
  | "hard_failed"
  | "confirming"
  | "saving"
  | "saved"
  | "correcting";

export interface CapturedPhoto {
  readonly data: string;
  readonly mediaType: string;
}

// Identifies the row a post-save correction (issue #51) is corrected
// against — returned by the save mutation once the initial write lands.
export interface SavedEntry {
  readonly diaryEntryId: string;
  readonly foodId: string;
  readonly loggedItemId: string;
}

// "instance" corrects just this log (a new logged_items row, corrected_from_id
// set, the original kept for audit) — "food" corrects the underlying Food
// itself, in place, for every future log of it (CONTEXT.md's Food-correction
// definition). See correct-label-photo.ts for what each writes.
export type CorrectionScope = "instance" | "food";

export interface Session {
  readonly phase: Phase;
  readonly photo: CapturedPhoto | null;
  readonly reading: ParsedLabelReading | null;
  readonly unit: Unit;
  readonly amount: number;
  readonly error: string | null;
  readonly savedEntry: SavedEntry | null;
  readonly correctionScope: CorrectionScope;
  // An edit was made after the initial save but not yet applied as a
  // correction — gates the "save correction" action and the scope toggle.
  readonly dirty: boolean;
  // Nutrient codes edited since the last save/correction — the correction
  // write only reattributes *these* to the user, so an untouched field's
  // original confidence/provenance (e.g. a still-unverified needs_review
  // value) never gets silently overwritten as "confident"/"user_corrected"
  // just because it rode along in the same reading.
  readonly editedNutrientCodes: readonly string[];
  // An instance-level correction was applied this session — the "quiet
  // persistent indicator" acceptance criterion, as opposed to the
  // food-level correction's toast (see `toast` below).
  readonly instanceCorrected: boolean;
  readonly toast: string | null;
}

export type Action =
  | { readonly type: "CAPTURE_PHOTO"; readonly photo: CapturedPhoto }
  | { readonly type: "EXTRACT_SUCCESS"; readonly reading: ParsedLabelReading }
  | { readonly type: "CAPTURE_FAILURE"; readonly message: string }
  | { readonly type: "EXTRACT_FAILURE"; readonly message: string }
  // A successful-but-incomplete read (issue #51) hands off to the
  // description path instead of confirming — resets this session the same
  // way a retake would.
  | { readonly type: "EXTRACT_INCOMPLETE" }
  | { readonly type: "RETAKE_PHOTO" }
  | { readonly type: "SET_UNIT"; readonly unit: Unit }
  | { readonly type: "SET_AMOUNT"; readonly amount: number }
  | { readonly type: "SAVE" }
  | { readonly type: "SAVE_SUCCESS"; readonly entry: SavedEntry }
  | { readonly type: "SAVE_FAILURE"; readonly message: string }
  | { readonly type: "EDIT_FOOD_NAME"; readonly name: string }
  | { readonly type: "EDIT_BRAND"; readonly value: string }
  | { readonly type: "EDIT_NUTRIENT"; readonly code: string; readonly value: number }
  | { readonly type: "SET_CORRECTION_SCOPE"; readonly scope: CorrectionScope }
  | { readonly type: "SAVE_CORRECTION" }
  | {
      readonly type: "CORRECTION_SUCCESS";
      readonly scope: CorrectionScope;
      // Only set for scope "instance" — the new logged item the correction
      // wrote, which becomes this session's current entry so a *second*
      // correction chains off it (corrected_from_id) instead of re-targeting
      // the now-superseded original.
      readonly loggedItemId?: string;
    }
  | { readonly type: "CORRECTION_FAILURE"; readonly message: string }
  | { readonly type: "DISMISS_TOAST" };

export const initialSession = (): Session => ({
  phase: "idle",
  photo: null,
  reading: null,
  unit: "100g",
  amount: 1,
  error: null,
  savedEntry: null,
  correctionScope: "instance",
  dirty: false,
  editedNutrientCodes: [],
  instanceCorrected: false,
  toast: null,
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

// A field edit is legal while confirming a not-yet-saved reading, or while
// reviewing an already-saved one (a pending correction) — any other phase
// (mid-extraction, mid-save, mid-correction) has nothing stable to edit.
const editable = (session: Session): boolean =>
  session.phase === "confirming" || session.phase === "saved";

// The food name/brand belong to the Food, not the logged item (CONTEXT.md)
// — there's no per-log override to write one to, so a post-save "just this
// log" correction has nowhere to put a name/brand edit. Nutrient values
// don't have that problem (nutrient_values can attach to either), so only
// the name/brand fields are restricted to the pre-save review.
const nameEditable = (session: Session): boolean => session.phase === "confirming";

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

    // The screen dispatches this instead of EXTRACT_SUCCESS when
    // isIncompleteReading(reading) is true, and hands the reading off to the
    // description path itself — this session has nothing left to do but
    // reset, same as a retake.
    case "EXTRACT_INCOMPLETE":
      if (session.phase !== "extracting") return session;
      return initialSession();

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

    // Stays on screen after saving (rather than handing straight back to the
    // caller) so the confirmed values can still be tapped into a correction —
    // see log-label-photo-screen.tsx's SavedView.
    case "SAVE_SUCCESS":
      if (session.phase !== "saving") return session;
      return { ...session, phase: "saved", savedEntry: action.entry, editedNutrientCodes: [] };

    case "SAVE_FAILURE":
      if (session.phase !== "saving") return session;
      return { ...session, phase: "confirming", error: action.message };

    // Field edits apply both before the first save (phase "confirming", plain
    // Stage 2 review) and after it (phase "saved", a pending correction) —
    // the one difference is that a post-save edit marks the session dirty so
    // the correction UI knows there's something to apply. A user-entered
    // value is, by definition, no longer in need of review.
    case "EDIT_FOOD_NAME": {
      if (!nameEditable(session) || !session.reading) return session;
      return {
        ...session,
        reading: { ...session.reading, foodName: action.name, foodNameConfidence: "confident" },
      };
    }

    case "EDIT_BRAND": {
      if (!nameEditable(session) || !session.reading) return session;
      return {
        ...session,
        reading: {
          ...session.reading,
          brand: { value: action.value, confidence: "confident" },
        },
      };
    }

    case "EDIT_NUTRIENT": {
      if (!editable(session) || !session.reading) return session;
      return {
        ...session,
        reading: {
          ...session.reading,
          nutrients: session.reading.nutrients.map((nutrient) =>
            nutrient.code === action.code
              ? { ...nutrient, value: action.value, confidence: "confident" as const }
              : nutrient,
          ),
        },
        dirty: session.phase === "saved" ? true : session.dirty,
        editedNutrientCodes: session.editedNutrientCodes.includes(action.code)
          ? session.editedNutrientCodes
          : [...session.editedNutrientCodes, action.code],
      };
    }

    case "SET_CORRECTION_SCOPE":
      if (session.phase !== "saved") return session;
      return { ...session, correctionScope: action.scope };

    case "SAVE_CORRECTION":
      if (session.phase !== "saved" || !session.dirty || !session.savedEntry) return session;
      return { ...session, phase: "correcting", error: null };

    case "CORRECTION_SUCCESS":
      if (session.phase !== "correcting") return session;
      return {
        ...session,
        phase: "saved",
        dirty: false,
        editedNutrientCodes: [],
        // Advance to the row the correction just wrote — a *second*
        // instance-level correction this session must chain off it (via
        // corrected_from_id), not re-target the now-superseded original.
        savedEntry:
          action.scope === "instance" && action.loggedItemId && session.savedEntry
            ? { ...session.savedEntry, loggedItemId: action.loggedItemId }
            : session.savedEntry,
        instanceCorrected: session.instanceCorrected || action.scope === "instance",
        toast:
          action.scope === "food"
            ? "Updated — future logs of this product will use this too."
            : session.toast,
      };

    case "CORRECTION_FAILURE":
      if (session.phase !== "correcting") return session;
      return { ...session, phase: "saved", error: action.message };

    case "DISMISS_TOAST":
      return { ...session, toast: null };

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

// Builds the description-path's initial text from an incomplete read (issue
// #51) — "carries forward whatever was successfully extracted rather than
// starting blank". Only the fields a free-text description can naturally
// carry (name, brand, amount); nutrient values aren't included; the
// description path re-derives nutrition itself (via resolveFood or the LLM
// estimate fallback) rather than trusting a reading this app already
// considered too incomplete to save as-is.
export function describeForHandoff(reading: ParsedLabelReading): string {
  const name = reading.brand?.value
    ? `${reading.foodName} (${reading.brand.value})`
    : reading.foodName;
  const amount = reading.servingSize?.value
    ? reading.servingSizeDescriptor?.value
      ? `${reading.servingSizeDescriptor.value} (${reading.servingSize.value}${reading.basisUnit})`
      : `${reading.servingSize.value}${reading.basisUnit}`
    : `100${reading.basisUnit}`;
  return `${name}, ${amount}`;
}
