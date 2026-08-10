import { VariantC6Base } from "./c6-base";
import type { dashboardData } from "../data";

// C6-C — Fresh teal + mesh blobs (4 distinct radial blobs instead of 3) with grain.
export function VariantC6C({ data }: { data: typeof dashboardData }) {
  return (
    <VariantC6Base
      data={data}
      theme={{
        pageBg: "bg-[#eefaf7]",
        blobs: ["bg-emerald-300/60", "bg-teal-200/60", "bg-cyan-200/50"],
        meshBlobs: ["top-1/3 right-[15%] h-56 w-56 rounded-full bg-teal-300/45"],
        barGradient: "from-emerald-500 via-teal-400 to-cyan-400",
        texture: "mesh",
      }}
    />
  );
}
