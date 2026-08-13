import { describe, expect, it } from "vitest";
import { initialSession, reduce, type Session } from "../../src/client/screens/log-description/reducer";

// Confirmed behaviors ported from prototype/log-description-logic's guided
// walkthroughs (ambiguity-strategy scenarios excluded — #50, not #46).
describe("log-description reducer", () => {
  it("happy path: submit -> saved, everything confident", () => {
    let session = initialSession();
    session = reduce(session, { type: "SUBMIT_DESCRIPTION", text: "Weetabix with a banana" });
    expect(session.phase).toBe("submitting");

    session = reduce(session, {
      type: "LOG_SUCCESS",
      items: [
        { foodName: "Weetabix Original", quantity: 40, quantityUnit: "g", confidence: "confident", source: "database" },
        { foodName: "Banana, raw", quantity: 100, quantityUnit: "g", confidence: "confident", source: "database" },
      ],
    });

    expect(session.phase).toBe("saved");
    expect(session.items).toHaveLength(2);
  });

  it("estimated quantity: a needs_review item still reaches saved, never blocks", () => {
    let session = initialSession();
    session = reduce(session, { type: "SUBMIT_DESCRIPTION", text: "A splash of oat milk in my coffee" });
    session = reduce(session, {
      type: "LOG_SUCCESS",
      items: [
        { foodName: "Oat milk", quantity: 30, quantityUnit: "ml", confidence: "needs_review", source: "database" },
      ],
    });

    expect(session.phase).toBe("saved");
    expect(session.items[0].confidence).toBe("needs_review");
  });

  it("total database gap: an llm_estimate_fallback item still reaches saved, never blocks", () => {
    let session = initialSession();
    session = reduce(session, {
      type: "SUBMIT_DESCRIPTION",
      text: "Dragon fruit protein smoothie from that new place",
    });
    session = reduce(session, {
      type: "LOG_SUCCESS",
      items: [
        {
          foodName: "Dragon fruit protein smoothie",
          quantity: 500,
          quantityUnit: "ml",
          confidence: "needs_review",
          source: "llm_estimate_fallback",
        },
      ],
    });

    expect(session.phase).toBe("saved");
    expect(session.items[0].source).toBe("llm_estimate_fallback");
  });

  it("illegal action — hard failure blocks save: nothing is trusted, no items land", () => {
    let session = initialSession();
    session = reduce(session, {
      type: "SUBMIT_DESCRIPTION",
      text: "asdkjfh q98q3rkj not real food words",
    });
    session = reduce(session, { type: "LOG_FAILURE", message: "Couldn't understand that description." });

    expect(session.phase).toBe("hard_failed");
    expect(session.items).toHaveLength(0);
  });

  it("a new submission resets a prior hard-failed session, so resubmitting after rephrasing works", () => {
    let session: Session = { phase: "hard_failed", description: "gibberish", items: [], error: "bad" };
    session = reduce(session, { type: "SUBMIT_DESCRIPTION", text: "Weetabix with a banana" });

    expect(session.phase).toBe("submitting");
    expect(session.error).toBeNull();
  });

  it("ignores LOG_SUCCESS/LOG_FAILURE outside the submitting phase — no illegal transitions", () => {
    const idle = initialSession();
    expect(reduce(idle, { type: "LOG_SUCCESS", items: [] })).toBe(idle);
    expect(reduce(idle, { type: "LOG_FAILURE", message: "x" })).toBe(idle);
  });
});
