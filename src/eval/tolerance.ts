// Shared numeric/identity comparison for scoring.ts (issue #48). Kept
// separate from scoring itself since both pipelines' scorers need the same
// two primitives: "is this number close enough" and "is this string the
// same identity, modulo formatting".

// A value is within tolerance of `expected` when it's within `toleranceRatio`
// of expected's magnitude (e.g. 0.02 for the label pipeline's ±2%, 0.15 for
// the description pipeline's ±15% — see docs/build-plan.md / ADR 0005).
// `expected === 0` is the one case a ratio can't express — anything but an
// exact 0 is treated as a miss, since "±2% of zero" is zero tolerance either
// way.
export const withinTolerance = (
  actual: number,
  expected: number,
  toleranceRatio: number,
): boolean =>
  expected === 0
    ? actual === 0
    : Math.abs(actual - expected) <= Math.abs(expected) * toleranceRatio;

// Trim+lowercase only — fixtures are hand-authored/reviewed, so the only
// drift expected between a fixture and a model's output is casing/
// whitespace, not spelling variants. Shared so identity comparisons (exact
// or substring) never drift onto a second normalization rule.
export const normalizeIdentity = (value: string): string =>
  value.trim().toLowerCase();

// Identity fields (ingredient/food names, units, nutrient codes) compare on
// meaning, not exact bytes — a model saying "Chicken Breast" against a
// fixture's "chicken breast" is the same ingredient. Deliberately just
// trim+lowercase, not fuzzy matching (see normalizeIdentity).
export const sameIdentity = (actual: string, expected: string): boolean =>
  normalizeIdentity(actual) === normalizeIdentity(expected);
