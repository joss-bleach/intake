// Issue #50 supersedes #46's reducer: description path is now parse -> review
// (clarify-up-front chips, inline quantity edits) -> confirm -> saved ->
// corrections, rather than one create-and-done call. See CONTEXT below each
// phase for what's legal there. ADR 0001's rule still holds throughout:
// needs_review is a normal state, never a block — only a hard Stage 2 parse
// failure blocks anything.

export type ClarifyOption = { readonly label: string; readonly searchTerm: string };

// One Stage 2 ingredient guess, plus whatever the user has done with it in
// the review phase so far. `index` is a stable key for the reviewing phase's
// dispatches — the array position from the `parse` response, never
// reordered — not a database id (nothing is saved yet).
export type ReviewIngredient = {
  readonly index: number;
  readonly name: string;
  readonly nameConfidence: "confident" | "needs_review";
  readonly quantity: number;
  readonly quantityUnit: "g" | "ml" | "serving";
  readonly quantityConfidence: "confident" | "needs_review";
  readonly clarifyOptions: ReadonlyArray<ClarifyOption> | null;
  // undefined = not answered yet (chip still shows, if clarifyOptions is
  // non-null); "" = explicitly skipped ("not sure"); anything else = the
  // chosen/typed search term, carried into confirm.
  readonly clarificationAnswer: string | undefined;
};

export type SavedItem = {
  readonly id: string;
  readonly foodId: string;
  readonly foodName: string;
  readonly quantity: number;
  readonly quantityUnit: "g" | "ml" | "serving";
  readonly confidence: "confident" | "needs_review" | null;
  readonly source: "database" | "llm_estimate_fallback" | "user_corrected";
  // Per-100g/100ml, straight off nutrient_values — the food-level correction
  // form's prefill. Optional only so reducer unit tests can build a minimal
  // fixture without it; the real server response always includes it.
  readonly nutrition?: ReadonlyArray<{ readonly code: string; readonly value: number; readonly unit: string }>;
};

export type Session =
  | { readonly phase: "idle"; readonly description: string; readonly error: null }
  | { readonly phase: "parsing"; readonly description: string; readonly error: null }
  | {
      readonly phase: "reviewing";
      readonly description: string;
      readonly ingredients: ReadonlyArray<ReviewIngredient>;
      readonly confirming: boolean;
      readonly error: string | null;
    }
  | { readonly phase: "hard_failed"; readonly description: string; readonly error: string }
  | {
      readonly phase: "saved";
      readonly diaryEntryId: string;
      readonly items: ReadonlyArray<SavedItem>;
    };

export type ParsedIngredientInput = {
  readonly name: string;
  readonly nameConfidence: "confident" | "needs_review";
  readonly quantity: number;
  readonly quantityUnit: "g" | "ml" | "serving";
  readonly quantityConfidence: "confident" | "needs_review";
  readonly clarifyOptions?: ReadonlyArray<ClarifyOption>;
};

export type Action =
  | { readonly type: "SUBMIT_DESCRIPTION"; readonly text: string }
  | { readonly type: "PARSE_SUCCESS"; readonly ingredients: ReadonlyArray<ParsedIngredientInput> }
  | { readonly type: "PARSE_FAILURE"; readonly message: string }
  | { readonly type: "ANSWER_CLARIFICATION"; readonly index: number; readonly searchTerm: string | null }
  | { readonly type: "EDIT_QUANTITY"; readonly index: number; readonly value: number }
  | { readonly type: "CONFIRM_START" }
  | { readonly type: "CONFIRM_SUCCESS"; readonly diaryEntryId: string; readonly items: ReadonlyArray<SavedItem> }
  | { readonly type: "CONFIRM_FAILURE"; readonly message: string }
  | { readonly type: "ITEMS_UPDATED"; readonly items: ReadonlyArray<SavedItem> };

export const initialSession = (): Session => ({
  phase: "idle",
  description: "",
  error: null,
});

const toReviewIngredients = (
  ingredients: ReadonlyArray<ParsedIngredientInput>,
): ReadonlyArray<ReviewIngredient> =>
  ingredients.map((ingredient, index) => ({
    index,
    name: ingredient.name,
    nameConfidence: ingredient.nameConfidence,
    quantity: ingredient.quantity,
    quantityUnit: ingredient.quantityUnit,
    quantityConfidence: ingredient.quantityConfidence,
    clarifyOptions: ingredient.clarifyOptions ?? null,
    clarificationAnswer: undefined,
  }));

export const reduce = (session: Session, action: Action): Session => {
  switch (action.type) {
    case "SUBMIT_DESCRIPTION":
      // Legal from any phase — resubmitting after a hard failure (rephrased
      // text) or starting a fresh log both just reset to "parsing".
      return { phase: "parsing", description: action.text, error: null };

    case "PARSE_SUCCESS":
      if (session.phase !== "parsing") return session;
      return {
        phase: "reviewing",
        description: session.description,
        ingredients: toReviewIngredients(action.ingredients),
        confirming: false,
        error: null,
      };

    case "PARSE_FAILURE":
      // A hard Stage 2 failure (malformed parse, retry exhausted server-side)
      // is the only thing that blocks a save — nothing was ever trusted.
      if (session.phase !== "parsing") return session;
      return { phase: "hard_failed", description: session.description, error: action.message };

    case "ANSWER_CLARIFICATION":
      if (session.phase !== "reviewing") return session;
      return {
        ...session,
        ingredients: session.ingredients.map((ingredient) =>
          ingredient.index === action.index
            ? { ...ingredient, clarificationAnswer: action.searchTerm ?? "" }
            : ingredient,
        ),
      };

    case "EDIT_QUANTITY":
      if (session.phase !== "reviewing") return session;
      return {
        ...session,
        ingredients: session.ingredients.map((ingredient) =>
          ingredient.index === action.index
            ? { ...ingredient, quantity: action.value, quantityConfidence: "confident" }
            : ingredient,
        ),
      };

    case "CONFIRM_START":
      if (session.phase !== "reviewing") return session;
      return { ...session, confirming: true, error: null };

    case "CONFIRM_SUCCESS":
      // needs_review items (an estimated quantity, a total database gap, an
      // unresolved ambiguity) land here alongside confident ones — a normal
      // success, never a block on saving (ADR 0001).
      if (session.phase !== "reviewing") return session;
      return { phase: "saved", diaryEntryId: action.diaryEntryId, items: action.items };

    case "CONFIRM_FAILURE":
      // An infra failure (network, db) — stays in "reviewing" so the user's
      // answers/edits aren't lost and they can just retry, unlike a hard
      // Stage 2 failure which has nothing left worth keeping.
      if (session.phase !== "reviewing") return session;
      return { ...session, confirming: false, error: action.message };

    case "ITEMS_UPDATED":
      // An instance- or food-level correction's mutation returns the whole
      // updated snapshot — swapped in wholesale rather than patched, so the
      // client never has to re-derive what the server's own
      // getDiaryEntryEffect (source of truth for "current" vs "superseded")
      // already decided.
      if (session.phase !== "saved") return session;
      return { ...session, items: action.items };

    default:
      return session;
  }
};
