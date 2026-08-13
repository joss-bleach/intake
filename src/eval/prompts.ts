import type { DescriptionFixture } from "./fixtures";

// Small, deliberately plain prompts — this harness measures the pipelines'
// production prompts eventually (issues #46/#47 own the real ones), but
// until those exist, a live --refresh run needs *some* prompt to call the
// candidate model with. Kept obviously separate from any future
// production prompt module so nobody mistakes this for it.
export const descriptionPrompt = (fixture: DescriptionFixture): string =>
  `Parse this free-text meal description into individual ingredients with ` +
  `estimated quantities. For each ingredient, report your confidence in ` +
  `its identity and its quantity as "confident" or "needs_review".\n\n` +
  `Description: ${fixture.input}`;

export const labelPrompt = (): string =>
  `Read the attached nutrition label photo. Extract the food name, brand ` +
  `(if printed), the basis unit (g or ml) and serving size the panel is ` +
  `printed per, and every nutrient value shown. For each field, report ` +
  `your confidence that it was read correctly as "confident" or ` +
  `"needs_review".`;
