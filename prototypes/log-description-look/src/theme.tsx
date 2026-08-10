import { motion } from "motion/react";

// PROTOTYPE — visual skin is NOT what this prototype is testing. It's the
// C6-B1 direction settled on the Dashboard screen (ticket #29, branch
// prototype/dashboard-look): cool-indigo pastel-gradient-blob backdrop,
// frosted glass, Newsreader Display. Ported verbatim (not re-derived) so
// this screen reads as the same app. What varies across the three variants
// here is the correction interaction, not the colour.
export const theme = {
  pageBg: "bg-[#f5f4fa]",
  blobs: ["bg-slate-300/50", "bg-violet-300/60", "bg-indigo-200/50"] as const,
  barGradient: "from-purple-600 via-violet-400 to-cyan-400",
  accentClass: "text-purple-600",
  accentGradient: "from-purple-600 to-cyan-500",
  text: {
    heading: "#1e1b4b",
    emphasisStrong: "#312c6b",
    label: "#403a7a",
    body: "#332e6d",
    suffixLight: "#6b64a3",
    foodName: "#282460",
    muted: "#5a5490",
    mutedLabel: "#4a4480",
    faint: "#8480ad",
  },
};

// Frosted-glass card recipe (C6-B1 "glass" texture — higher-opacity fill +
// stronger blur/ring than the dashboard's base glass).
export const panelClass =
  "relative overflow-hidden rounded-[2rem] bg-white/60 p-5 ring-1 ring-inset ring-white/85 backdrop-blur-2xl";
export const tileClass =
  "relative overflow-hidden rounded-[1.5rem] bg-white/60 p-4 ring-1 ring-inset ring-white/85 backdrop-blur-2xl";
export const sheenClass =
  "pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-white/60 via-white/10 to-transparent";

// needs_review is a normal success state (ADR 0001), not an error — amber,
// not red, and phrased as "estimated" rather than a warning.
export const reviewBadgeClass =
  "inline-flex items-center gap-1 rounded-full bg-amber-100/80 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200";
export const confidentDotClass = "text-emerald-500";

// Ported verbatim from c6-base.tsx (prototype/dashboard-look) — same blob
// geometry, animation, and white gradient wash. The static, unanimated,
// differently-positioned version this replaced is why the first pass didn't
// read as the same app: the backdrop is most of what makes C6-B1 recognizable.
export function Blobs() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <motion.div
        className={`absolute -left-24 -top-16 h-72 w-72 rounded-full ${theme.blobs[0]} blur-3xl`}
        animate={{ x: [0, 18, 0], y: [0, 14, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className={`absolute -right-28 top-40 h-80 w-80 rounded-full ${theme.blobs[1]} blur-3xl`}
        animate={{ x: [0, -16, 0], y: [0, 20, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className={`absolute bottom-0 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full ${theme.blobs[2]} blur-3xl`}
        animate={{ x: [0, 14, 0], y: [0, -12, 0], scale: [1, 1.06, 1] }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-white/40" />
    </div>
  );
}

// Macro chip palette — locked red/yellow/green-adjacent family, identical to
// the dashboard's bento tiles (protein=rose, carbs=amber, fat=violet).
export const MACRO_CHIP = {
  protein: { bar: "from-rose-300 to-rose-400", chip: "bg-rose-50 text-rose-600" },
  carbs: { bar: "from-amber-200 to-amber-400", chip: "bg-amber-50 text-amber-600" },
  fat: { bar: "from-violet-300 to-violet-400", chip: "bg-violet-50 text-violet-600" },
} as const;
