// Ported from prototype/log-description-logic (issue #46's confident-case
// happy path only — ambiguity/correction actions from the prototype
// (ANSWER_CLARIFICATION, SELECT_CANDIDATE, EDIT_QUANTITY, EDIT_NUTRITION)
// belong to #50 and aren't ported here).
//
// One difference from the prototype: there, Stage 2's retry-once-then-hard-
// fail was simulated client-side (a `retryCount`, two dispatched
// PARSE_FAILUREs) because the prototype had no real backend. The real
// pipeline's retry (ADR 0001) runs entirely inside
// generateObjectWithFallbackEffect on the server (src/ai/effect-ai-sdk.ts) —
// the client only ever sees the mutation's final outcome, so the phase
// machine collapses parsing/resolving into one "submitting" phase and drops
// retryCount.
export type LoggedItemSummary = {
  readonly foodName: string;
  readonly quantity: number;
  readonly quantityUnit: "g" | "ml" | "serving";
  readonly confidence: "confident" | "needs_review" | null;
  readonly source: "database" | "llm_estimate_fallback";
};

export type Session = {
  readonly phase: "idle" | "submitting" | "hard_failed" | "saved";
  readonly description: string;
  readonly items: ReadonlyArray<LoggedItemSummary>;
  readonly error: string | null;
};

export type Action =
  | { readonly type: "SUBMIT_DESCRIPTION"; readonly text: string }
  | { readonly type: "LOG_SUCCESS"; readonly items: ReadonlyArray<LoggedItemSummary> }
  | { readonly type: "LOG_FAILURE"; readonly message: string };

export const initialSession = (): Session => ({
  phase: "idle",
  description: "",
  items: [],
  error: null,
});

export const reduce = (session: Session, action: Action): Session => {
  switch (action.type) {
    case "SUBMIT_DESCRIPTION":
      return { phase: "submitting", description: action.text, items: [], error: null };

    case "LOG_SUCCESS":
      // needs_review items (an estimated quantity, a total database gap) land
      // here alongside confident ones — ADR 0001: they're a normal success,
      // never a block on saving.
      if (session.phase !== "submitting") return session;
      return { ...session, phase: "saved", items: action.items };

    case "LOG_FAILURE":
      // A hard Stage 2 failure (malformed parse, retry exhausted) is the only
      // thing that blocks a save — nothing was ever trusted, so there's
      // nothing to persist.
      if (session.phase !== "submitting") return session;
      return { ...session, phase: "hard_failed", error: action.message };

    default:
      return session;
  }
};
