import { describe, expect, it } from "vitest";
import { initialSession, reduce, type Session } from "../../src/client/screens/log-description/reducer";

// Issue #50 supersedes #46's happy-path-only reducer test: description path
// is now parse -> review (clarify-up-front chips, inline edits) -> confirm
// -> saved -> corrections.
describe("log-description reducer", () => {
  it("happy path: submit -> parsed -> reviewing -> confirmed -> saved, everything confident", () => {
    let session = initialSession();
    session = reduce(session, { type: "SUBMIT_DESCRIPTION", text: "Weetabix with a banana" });
    expect(session.phase).toBe("parsing");

    session = reduce(session, {
      type: "PARSE_SUCCESS",
      ingredients: [
        { name: "Weetabix", nameConfidence: "confident", quantity: 40, quantityUnit: "g", quantityConfidence: "confident" },
        { name: "Banana", nameConfidence: "confident", quantity: 100, quantityUnit: "g", quantityConfidence: "confident" },
      ],
    });
    expect(session.phase).toBe("reviewing");
    if (session.phase !== "reviewing") throw new Error("unreachable");
    expect(session.ingredients).toHaveLength(2);
    expect(session.ingredients.every((i) => i.clarifyOptions === null)).toBe(true);

    session = reduce(session, { type: "CONFIRM_START" });
    if (session.phase !== "reviewing") throw new Error("unreachable");
    expect(session.confirming).toBe(true);

    session = reduce(session, {
      type: "CONFIRM_SUCCESS",
      diaryEntryId: "entry-1",
      items: [
        { id: "item-1", foodId: "food-1", foodName: "Weetabix Original", quantity: 40, quantityUnit: "g", confidence: "confident", source: "database" },
        { id: "item-2", foodId: "food-2", foodName: "Banana, raw", quantity: 100, quantityUnit: "g", confidence: "confident", source: "database" },
      ],
    });

    expect(session.phase).toBe("saved");
    if (session.phase !== "saved") throw new Error("unreachable");
    expect(session.items).toHaveLength(2);
  });

  it("estimated quantity: a needs_review item still reaches saved, never blocks", () => {
    let session = initialSession();
    session = reduce(session, { type: "SUBMIT_DESCRIPTION", text: "A splash of oat milk in my coffee" });
    session = reduce(session, {
      type: "PARSE_SUCCESS",
      ingredients: [
        { name: "Oat milk", nameConfidence: "confident", quantity: 30, quantityUnit: "ml", quantityConfidence: "needs_review" },
      ],
    });
    session = reduce(session, { type: "CONFIRM_START" });
    session = reduce(session, {
      type: "CONFIRM_SUCCESS",
      diaryEntryId: "entry-1",
      items: [{ id: "item-1", foodId: "food-1", foodName: "Oat milk", quantity: 30, quantityUnit: "ml", confidence: "needs_review", source: "database" }],
    });

    expect(session.phase).toBe("saved");
    if (session.phase !== "saved") throw new Error("unreachable");
    expect(session.items[0].confidence).toBe("needs_review");
  });

  it("total database gap: an llm_estimate_fallback item still reaches saved, never blocks", () => {
    let session = initialSession();
    session = reduce(session, { type: "SUBMIT_DESCRIPTION", text: "Dragon fruit protein smoothie from that new place" });
    session = reduce(session, {
      type: "PARSE_SUCCESS",
      ingredients: [
        { name: "Dragon fruit protein smoothie", nameConfidence: "needs_review", quantity: 500, quantityUnit: "ml", quantityConfidence: "needs_review" },
      ],
    });
    session = reduce(session, { type: "CONFIRM_START" });
    session = reduce(session, {
      type: "CONFIRM_SUCCESS",
      diaryEntryId: "entry-1",
      items: [{ id: "item-1", foodId: "food-1", foodName: "Dragon fruit protein smoothie", quantity: 500, quantityUnit: "ml", confidence: "needs_review", source: "llm_estimate_fallback" }],
    });

    expect(session.phase).toBe("saved");
    if (session.phase !== "saved") throw new Error("unreachable");
    expect(session.items[0].source).toBe("llm_estimate_fallback");
  });

  it("illegal action — hard failure blocks save: nothing is trusted, no items land", () => {
    let session = initialSession();
    session = reduce(session, { type: "SUBMIT_DESCRIPTION", text: "asdkjfh q98q3rkj not real food words" });
    session = reduce(session, { type: "PARSE_FAILURE", message: "Couldn't understand that description." });

    expect(session.phase).toBe("hard_failed");
  });

  it("a new submission resets a prior hard-failed session, so resubmitting after rephrasing works", () => {
    let session: Session = { phase: "hard_failed", description: "gibberish", error: "bad" };
    session = reduce(session, { type: "SUBMIT_DESCRIPTION", text: "Weetabix with a banana" });

    expect(session.phase).toBe("parsing");
    if (session.phase !== "parsing") throw new Error("unreachable");
    expect(session.error).toBeNull();
  });

  it("ignores PARSE_SUCCESS/PARSE_FAILURE outside the parsing phase — no illegal transitions", () => {
    const idle = initialSession();
    expect(reduce(idle, { type: "PARSE_SUCCESS", ingredients: [] })).toBe(idle);
    expect(reduce(idle, { type: "PARSE_FAILURE", message: "x" })).toBe(idle);
  });

  describe("clarify-up-front ambiguity", () => {
    const parseAmbiguousLatte = (): Session => {
      let session = initialSession();
      session = reduce(session, { type: "SUBMIT_DESCRIPTION", text: "A latte" });
      session = reduce(session, {
        type: "PARSE_SUCCESS",
        ingredients: [
          {
            name: "Latte",
            nameConfidence: "needs_review",
            quantity: 350,
            quantityUnit: "ml",
            quantityConfidence: "confident",
            clarifyOptions: [
              { label: "Whole milk", searchTerm: "latte whole milk" },
              { label: "Oat milk", searchTerm: "latte oat milk" },
              { label: "Skimmed milk", searchTerm: "latte skimmed milk" },
            ],
          },
        ],
      });
      return session;
    };

    it("surfaces clarifyOptions on the ingredient right after parsing — before any save", () => {
      const session = parseAmbiguousLatte();
      expect(session.phase).toBe("reviewing");
      if (session.phase !== "reviewing") throw new Error("unreachable");
      expect(session.ingredients[0].clarifyOptions).toHaveLength(3);
      expect(session.ingredients[0].clarificationAnswer).toBeUndefined();
    });

    it("answering a chip carries its searchTerm into the ingredient for confirm", () => {
      let session = parseAmbiguousLatte();
      session = reduce(session, { type: "ANSWER_CLARIFICATION", index: 0, searchTerm: "latte oat milk" });

      if (session.phase !== "reviewing") throw new Error("unreachable");
      expect(session.ingredients[0].clarificationAnswer).toBe("latte oat milk");
    });

    it("save while still ambiguous is allowed — ADR 0001's never-block rule applies to identity too", () => {
      let session = parseAmbiguousLatte();
      session = reduce(session, { type: "CONFIRM_START" });
      session = reduce(session, {
        type: "CONFIRM_SUCCESS",
        diaryEntryId: "entry-1",
        items: [{ id: "item-1", foodId: "food-1", foodName: "Latte", quantity: 350, quantityUnit: "ml", confidence: "needs_review", source: "database" }],
      });

      expect(session.phase).toBe("saved");
    });

    it('"Something else…" free text is carried the same way a chip answer is', () => {
      let session = parseAmbiguousLatte();
      session = reduce(session, { type: "ANSWER_CLARIFICATION", index: 0, searchTerm: "soy milk latte" });

      if (session.phase !== "reviewing") throw new Error("unreachable");
      expect(session.ingredients[0].clarificationAnswer).toBe("soy milk latte");
    });

    it('"Not sure, skip" records an explicit skip, distinct from never having answered', () => {
      let session = parseAmbiguousLatte();
      session = reduce(session, { type: "ANSWER_CLARIFICATION", index: 0, searchTerm: null });

      if (session.phase !== "reviewing") throw new Error("unreachable");
      expect(session.ingredients[0].clarificationAnswer).toBe("");
    });
  });

  describe("inline quantity edits before save", () => {
    it("editing quantity in the reviewing phase marks it confident", () => {
      let session = initialSession();
      session = reduce(session, { type: "SUBMIT_DESCRIPTION", text: "A splash of oat milk" });
      session = reduce(session, {
        type: "PARSE_SUCCESS",
        ingredients: [
          { name: "Oat milk", nameConfidence: "confident", quantity: 30, quantityUnit: "ml", quantityConfidence: "needs_review" },
        ],
      });
      session = reduce(session, { type: "EDIT_QUANTITY", index: 0, value: 50 });

      if (session.phase !== "reviewing") throw new Error("unreachable");
      expect(session.ingredients[0].quantity).toBe(50);
      expect(session.ingredients[0].quantityConfidence).toBe("confident");
    });
  });

  describe("confirm failure", () => {
    it("an infra failure stays in reviewing so answers/edits aren't lost, unlike a hard parse failure", () => {
      let session = initialSession();
      session = reduce(session, { type: "SUBMIT_DESCRIPTION", text: "Weetabix" });
      session = reduce(session, {
        type: "PARSE_SUCCESS",
        ingredients: [{ name: "Weetabix", nameConfidence: "confident", quantity: 40, quantityUnit: "g", quantityConfidence: "confident" }],
      });
      session = reduce(session, { type: "CONFIRM_START" });
      session = reduce(session, { type: "CONFIRM_FAILURE", message: "Couldn't save that entry." });

      expect(session.phase).toBe("reviewing");
      if (session.phase !== "reviewing") throw new Error("unreachable");
      expect(session.confirming).toBe(false);
      expect(session.error).toBe("Couldn't save that entry.");
    });
  });

  describe("corrections after save", () => {
    it("ITEMS_UPDATED swaps in the server's full snapshot after a correction", () => {
      let session: Session = {
        phase: "saved",
        diaryEntryId: "entry-1",
        items: [{ id: "item-1", foodId: "food-1", foodName: "Latte", quantity: 350, quantityUnit: "ml", confidence: "needs_review", source: "database" }],
      };
      session = reduce(session, {
        type: "ITEMS_UPDATED",
        items: [{ id: "item-2", foodId: "food-2", foodName: "Latte, oat milk", quantity: 350, quantityUnit: "ml", confidence: "confident", source: "user_corrected" }],
      });

      if (session.phase !== "saved") throw new Error("unreachable");
      expect(session.items).toHaveLength(1);
      expect(session.items[0].source).toBe("user_corrected");
    });

    it("ignores ITEMS_UPDATED outside the saved phase", () => {
      const idle = initialSession();
      expect(reduce(idle, { type: "ITEMS_UPDATED", items: [] })).toBe(idle);
    });
  });
});
