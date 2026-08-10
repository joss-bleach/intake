import { VariantC6Base } from "./c6-base";
import type { dashboardData } from "../data";

// C6-B — Cool indigo + frosted glass cards (clean backdrop, glassier panels).
export function VariantC6B({ data }: { data: typeof dashboardData }) {
  return (
    <VariantC6Base
      data={data}
      theme={{
        pageBg: "bg-[#f5f4fa]",
        blobs: ["bg-slate-300/50", "bg-violet-300/60", "bg-indigo-200/50"],
        barGradient: "from-purple-600 via-violet-400 to-cyan-400",
        texture: "glass",
      }}
    />
  );
}
