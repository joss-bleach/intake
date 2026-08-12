// Display-only metadata for the macro-ratio presets. The actual ratios
// (and every gram of derivation) live server-side in
// src/server/goals/macros.ts — the client only ever sends a preset id and
// reads back the grams the server derived, per that module's "recompute on
// every read, never trust a stored gram value" design. These percentages
// are duplicated here purely for copy, and must stay in sync with
// `macroRatioPresets` there.
export const macroPresets = [
  {
    id: "balanced",
    label: "Balanced",
    description: "30% protein · 40% carbs · 30% fat",
  },
  {
    id: "high_protein",
    label: "High protein",
    description: "40% protein · 35% carbs · 25% fat",
  },
  {
    id: "low_carb",
    label: "Low carb",
    description: "30% protein · 20% carbs · 50% fat",
  },
] as const;

export type MacroPresetId = (typeof macroPresets)[number]["id"];
