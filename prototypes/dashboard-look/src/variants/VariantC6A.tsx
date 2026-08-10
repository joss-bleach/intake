import { VariantC6Base } from "./c6-base";
import type { dashboardData } from "../data";

// C6-A — Lavender (current-ish) + film grain texture on the backdrop.
export function VariantC6A({ data }: { data: typeof dashboardData }) {
  return (
    <VariantC6Base
      data={data}
      theme={{
        pageBg: "bg-[#f6f2fb]",
        blobs: ["bg-violet-300/60", "bg-fuchsia-200/60", "bg-sky-200/50"],
        barGradient: "from-violet-500 via-fuchsia-400 to-sky-400",
        navActiveClass: "text-violet-600",
        navButtonGradient: "from-violet-500 to-fuchsia-500",
        texture: "grain",
      }}
    />
  );
}
