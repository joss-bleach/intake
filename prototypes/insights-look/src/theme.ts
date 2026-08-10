import type { C6Theme } from "./c6-shared";

// The accepted C6-B1 theme (origin/prototype/dashboard-look, src/variants/VariantC6B1.tsx),
// reused unchanged — colour/typography direction is settled, not part of this prototype's
// open question. Only the comparison-block layout (variants A/B/C) is what's being explored.
export const THEME: C6Theme = {
  pageBg: "bg-[#f5f4fa]",
  blobs: ["bg-slate-300/50", "bg-violet-300/60", "bg-indigo-200/50"],
  barGradient: "from-purple-600 via-violet-400 to-cyan-400",
  navActiveClass: "text-purple-600",
  navButtonGradient: "from-purple-600 to-cyan-500",
  texture: "glass",
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
