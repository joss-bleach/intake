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

export function Blobs() {
  return (
    <div className="absolute inset-0 -z-20 overflow-hidden">
      <div className={`absolute -top-24 -left-16 h-72 w-72 rounded-full blur-3xl ${theme.blobs[0]}`} />
      <div className={`absolute top-1/3 -right-20 h-80 w-80 rounded-full blur-3xl ${theme.blobs[1]}`} />
      <div className={`absolute bottom-0 left-1/4 h-64 w-64 rounded-full blur-3xl ${theme.blobs[2]}`} />
    </div>
  );
}
