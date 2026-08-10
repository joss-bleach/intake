import { VariantC6Base } from "./c6-base";
import type { dashboardData } from "../data";

// C6-D — Warm sunrise, untextured control.
export function VariantC6D({ data }: { data: typeof dashboardData }) {
  return (
    <VariantC6Base
      data={data}
      theme={{
        pageBg: "bg-[#fdf4ec]",
        blobs: ["bg-amber-300/60", "bg-orange-200/60", "bg-rose-200/50"],
        barGradient: "from-amber-500 via-orange-400 to-rose-400",
        texture: "none",
      }}
    />
  );
}
