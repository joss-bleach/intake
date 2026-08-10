import { ArrowDown, ArrowUp, Check } from "lucide-react";
import type { C6TextPalette } from "./c6-shared";
import type { NrvDirection, NrvItem, Period } from "./data";
import { directionFor } from "./data";

// Shared across all three comparison-block variants (A/B/C) — the thing being explored is
// layout, not colour, so the "outside the band" colour language stays fixed here. Reuses
// existing palette families rather than inventing new hues: amber for "get more of" (same
// family as the carbs macro chip), a cooler cyan for "get less of" (same family as the hero
// bar's cyan endpoint). On-target intentionally gets no colour — only out-of-band values are
// colour-coded, per the brief.
export const DIRECTION_STYLE: Record<Exclude<NrvDirection, "on-target">, {
  label: string;
  text: string;
  bg: string;
  ring: string;
  bar: string;
  solid: string;
}> = {
  more: {
    label: "Get more of",
    text: "text-amber-600",
    bg: "bg-amber-50",
    ring: "ring-amber-200",
    bar: "from-amber-300 to-amber-500",
    solid: "#f59e0b",
  },
  less: {
    label: "Get less of",
    text: "text-cyan-700",
    bg: "bg-cyan-50",
    ring: "ring-cyan-200",
    bar: "from-cyan-300 to-cyan-500",
    solid: "#0e7490",
  },
};

export const DIRECTION_ICON: Record<NrvDirection, typeof ArrowUp> = {
  more: ArrowUp,
  less: ArrowDown,
  "on-target": Check,
};

export type ResolvedNrvItem = {
  nutrient: string;
  pct: number;
  direction: NrvDirection;
  distanceFromTarget: number;
};

export function resolveNrvItems(items: NrvItem[], period: Period): ResolvedNrvItem[] {
  return items.map((item) => {
    const pct = period === "today" ? item.today : item.week;
    return {
      nutrient: item.nutrient,
      pct,
      direction: directionFor(pct),
      distanceFromTarget: Math.abs(pct - 100),
    };
  });
}

/** Plainly states what "more of / less of" is measured against — a caption, not a tooltip. */
export function ComparisonCaption({ t }: { t: C6TextPalette }) {
  return (
    <p className="mt-1 text-xs leading-relaxed" style={{ color: t.muted }}>
      Against UK/EU Nutrient Reference Values. Within 90–110% of the NRV counts as on target —
      only values outside that band are flagged.
    </p>
  );
}
