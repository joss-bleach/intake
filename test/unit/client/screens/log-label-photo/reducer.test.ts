import { describe, expect, it } from "vitest";
import {
  anyFieldNeedsReview,
  availableUnits,
  computeTotals,
  initialSession,
  reduce,
  resolveBasisAmount,
  type ParsedLabelReading,
  type Session,
} from "../../../../../src/client/screens/log-label-photo/reducer";

// Confirmed behaviors for the reducer(session, action) -> session pipeline
// (issue #47's acceptance criteria) — no `prototype/log-label-photo-logic`
// exists to port from (see PR description), so these are derived directly
// from the AC and ADR 0001's retry/needs_review rules, mirroring the shape
// of prototype/log-description-logic's confirmed-behavior test style.

const readingWithServing: ParsedLabelReading = {
  foodName: "Oat & Berry Granola Bar",
  foodNameConfidence: "confident",
  brand: { value: "Nature Valley", confidence: "confident" },
  basisUnit: "g",
  servingSize: { value: 40, confidence: "confident" },
  nutrients: [
    { code: "energy_kcal", value: 425, unit: "kcal", confidence: "confident" },
    { code: "sugars_g", value: 22, unit: "g", confidence: "needs_review" },
  ],
};

const readingWithoutServing: ParsedLabelReading = {
  ...readingWithServing,
  servingSize: undefined,
};

const photo = { data: "base64==", mediaType: "image/jpeg" };

describe("initialSession", () => {
  it("starts idle with nothing captured", () => {
    expect(initialSession()).toEqual<Session>({
      phase: "idle",
      photo: null,
      reading: null,
      unit: "100g",
      amount: 1,
      error: null,
    });
  });
});

describe("reduce — capture and extraction", () => {
  it("CAPTURE_PHOTO from idle moves to extracting", () => {
    const session = reduce(initialSession(), { type: "CAPTURE_PHOTO", photo });
    expect(session.phase).toBe("extracting");
    expect(session.photo).toEqual(photo);
  });

  it("EXTRACT_SUCCESS defaults to serving unit when a serving size was printed", () => {
    const extracting = reduce(initialSession(), { type: "CAPTURE_PHOTO", photo });
    const session = reduce(extracting, { type: "EXTRACT_SUCCESS", reading: readingWithServing });

    expect(session.phase).toBe("confirming");
    expect(session.reading).toEqual(readingWithServing);
    expect(session.unit).toBe("serving");
    expect(session.amount).toBe(1);
  });

  it("EXTRACT_SUCCESS falls back to 100g unit when no serving size was printed", () => {
    const extracting = reduce(initialSession(), { type: "CAPTURE_PHOTO", photo });
    const session = reduce(extracting, {
      type: "EXTRACT_SUCCESS",
      reading: readingWithoutServing,
    });

    expect(session.unit).toBe("100g");
  });

  it("EXTRACT_FAILURE hard-fails without a further client-side retry", () => {
    // The server has already exhausted ADR 0001's one retry against the
    // fallback model by the time this action fires — this is the *second*
    // failure, so the reducer must hard-fail rather than loop.
    const extracting = reduce(initialSession(), { type: "CAPTURE_PHOTO", photo });
    const session = reduce(extracting, {
      type: "EXTRACT_FAILURE",
      message: "Couldn't read that label.",
    });

    expect(session.phase).toBe("hard_failed");
    expect(session.error).toBe("Couldn't read that label.");
  });

  it("RETAKE_PHOTO resets a hard-failed session back to idle", () => {
    const extracting = reduce(initialSession(), { type: "CAPTURE_PHOTO", photo });
    const failed = reduce(extracting, { type: "EXTRACT_FAILURE", message: "nope" });
    const session = reduce(failed, { type: "RETAKE_PHOTO" });

    expect(session).toEqual(initialSession());
  });

  it("RETAKE_PHOTO from confirming discards the extracted reading", () => {
    const extracting = reduce(initialSession(), { type: "CAPTURE_PHOTO", photo });
    const confirming = reduce(extracting, {
      type: "EXTRACT_SUCCESS",
      reading: readingWithServing,
    });
    const session = reduce(confirming, { type: "RETAKE_PHOTO" });

    expect(session).toEqual(initialSession());
  });
});

describe("reduce — illegal transitions are no-ops", () => {
  it("ignores EXTRACT_SUCCESS when not extracting", () => {
    const session = reduce(initialSession(), {
      type: "EXTRACT_SUCCESS",
      reading: readingWithServing,
    });
    expect(session).toEqual(initialSession());
  });

  it("ignores SAVE when not confirming", () => {
    const session = reduce(initialSession(), { type: "SAVE" });
    expect(session).toEqual(initialSession());
  });
});

describe("reduce — unit toggle and amount", () => {
  const confirming = reduce(
    reduce(initialSession(), { type: "CAPTURE_PHOTO", photo }),
    { type: "EXTRACT_SUCCESS", reading: readingWithServing },
  );

  it("SET_UNIT reseeds the amount at that unit's default", () => {
    const grams = reduce(confirming, { type: "SET_UNIT", unit: "grams" });
    expect(grams.unit).toBe("grams");
    expect(grams.amount).toBe(40); // seeded at the printed serving size

    const per100g = reduce(confirming, { type: "SET_UNIT", unit: "100g" });
    expect(per100g.amount).toBe(1);
  });

  it("SET_AMOUNT updates the amount directly", () => {
    const session = reduce(confirming, { type: "SET_AMOUNT", amount: 2.5 });
    expect(session.amount).toBe(2.5);
  });

  it("SET_AMOUNT rejects a non-positive amount", () => {
    const session = reduce(confirming, { type: "SET_AMOUNT", amount: 0 });
    expect(session.amount).toBe(confirming.amount);
  });
});

describe("reduce — save", () => {
  const confirming = reduce(
    reduce(initialSession(), { type: "CAPTURE_PHOTO", photo }),
    { type: "EXTRACT_SUCCESS", reading: readingWithServing },
  );

  it("SAVE moves to saving, SAVE_SUCCESS moves to saved", () => {
    const saving = reduce(confirming, { type: "SAVE" });
    expect(saving.phase).toBe("saving");

    const saved = reduce(saving, { type: "SAVE_SUCCESS" });
    expect(saved.phase).toBe("saved");
  });

  it("SAVE_FAILURE returns to confirming with an error, so Save can be retried", () => {
    const saving = reduce(confirming, { type: "SAVE" });
    const session = reduce(saving, { type: "SAVE_FAILURE", message: "Network error." });

    expect(session.phase).toBe("confirming");
    expect(session.error).toBe("Network error.");
    expect(session.reading).toEqual(readingWithServing);
  });
});

describe("availableUnits", () => {
  it("offers serving only when a serving size was printed", () => {
    expect(availableUnits(readingWithServing)).toEqual(["serving", "100g", "grams"]);
    expect(availableUnits(readingWithoutServing)).toEqual(["100g", "grams"]);
  });
});

describe("resolveBasisAmount", () => {
  const base: Session = {
    phase: "confirming",
    photo,
    reading: readingWithServing,
    unit: "100g",
    amount: 1,
    error: null,
  };

  it("100g mode scales amount * 100", () => {
    expect(resolveBasisAmount({ ...base, unit: "100g", amount: 2.5 })).toBe(250);
  });

  it("grams mode passes the amount straight through", () => {
    expect(resolveBasisAmount({ ...base, unit: "grams", amount: 45 })).toBe(45);
  });

  it("serving mode scales amount * printed serving size", () => {
    expect(resolveBasisAmount({ ...base, unit: "serving", amount: 2 })).toBe(80);
  });

  it("serving mode is unresolvable when no serving size was printed", () => {
    expect(
      resolveBasisAmount({ ...base, unit: "serving", reading: readingWithoutServing }),
    ).toBeNull();
  });

  it("is null with no reading yet", () => {
    expect(resolveBasisAmount({ ...base, reading: null })).toBeNull();
  });
});

describe("computeTotals", () => {
  it("scales every per-100(g|ml) nutrient to the confirmed basis amount", () => {
    const totals = computeTotals(readingWithServing, 200);

    expect(totals).toEqual([
      { code: "energy_kcal", value: 850, unit: "kcal" },
      { code: "sugars_g", value: 44, unit: "g" },
    ]);
  });
});

describe("anyFieldNeedsReview", () => {
  it("is true when any nutrient needs review", () => {
    expect(anyFieldNeedsReview(readingWithServing)).toBe(true);
  });

  it("is false when every field is confident", () => {
    const allConfident: ParsedLabelReading = {
      ...readingWithServing,
      nutrients: [
        { code: "energy_kcal", value: 425, unit: "kcal", confidence: "confident" },
        { code: "sugars_g", value: 22, unit: "g", confidence: "confident" },
      ],
    };
    expect(anyFieldNeedsReview(allConfident)).toBe(false);
  });

  it("is true when the food name itself needs review", () => {
    const allConfident: ParsedLabelReading = {
      ...readingWithServing,
      foodNameConfidence: "needs_review",
      nutrients: [
        { code: "energy_kcal", value: 425, unit: "kcal", confidence: "confident" },
        { code: "sugars_g", value: 22, unit: "g", confidence: "confident" },
      ],
    };
    expect(anyFieldNeedsReview(allConfident)).toBe(true);
  });
});
