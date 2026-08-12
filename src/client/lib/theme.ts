// C6-B1 theme tokens — cool-indigo colourway, ported verbatim from
// prototype/dashboard-look (VariantC6B1, branch-local ticket #29) and carried
// unchanged through both logging-flow prototypes (prototype/log-description-look,
// prototype/log-label-photo-look). This is the one settled visual direction;
// any screen dropping into <AppShell> reads its colours off this object
// rather than re-deriving them.
export const theme = {
  pageBg: "bg-[#f5f4fa]",
  blobs: ["bg-slate-300/50", "bg-violet-300/60", "bg-indigo-200/50"] as const,
  barGradient: "from-purple-600 via-violet-400 to-cyan-400",
  accentClass: "text-purple-600",
  accentGradient: "from-purple-600 to-cyan-500",
  navActiveClass: "text-purple-600",
  navButtonGradient: "from-purple-600 to-cyan-500",
  text: {
    heading: "var(--shell-text-heading)",
    emphasisStrong: "var(--shell-text-emphasis-strong)",
    label: "var(--shell-text-label)",
    body: "var(--shell-text-body)",
    suffixLight: "var(--shell-text-suffix-light)",
    foodName: "var(--shell-text-food-name)",
    muted: "var(--shell-text-muted)",
    mutedLabel: "var(--shell-text-muted-label)",
    faint: "var(--shell-text-faint)",
  },
} as const;

// needs_review is a normal success state (ADR 0001), not an error — amber,
// not red, and phrased as "estimated" rather than a warning. Ported here
// alongside the rest of the theme so the logging-flow screens (#46, #47)
// don't redefine it.
export const reviewBadgeClass =
  "inline-flex items-center gap-1 rounded-full bg-amber-100/80 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200";
export const confidentDotClass = "text-emerald-500";
