import { VariantC6Base } from "./c6-base";
import type { dashboardData } from "../data";

// C6-B1 — same cool-indigo theme as C6-B, but the food log is grouped into
// breakfast/lunch/dinner/snacks instead of a flat recently-logged list.
export function VariantC6B1({ data }: { data: typeof dashboardData }) {
  return (
    <VariantC6Base
      data={data}
      theme={{
        pageBg: "bg-[#f5f4fa]",
        blobs: ["bg-slate-300/50", "bg-violet-300/60", "bg-indigo-200/50"],
        barGradient: "from-purple-600 via-violet-400 to-cyan-400",
        navActiveClass: "text-purple-600",
        navButtonGradient: "from-purple-600 to-cyan-500",
        texture: "glass",
        foodBlock: "meals",
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
      }}
    />
  );
}
