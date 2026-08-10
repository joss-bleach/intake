import type { C6TextPalette } from "../c6-shared";
import { ComparisonCaption, DIRECTION_STYLE, type ResolvedNrvItem } from "../comparison-shared";

// Variant A — banded bars. One horizontal bar per nutrient on a 0–150%-of-NRV scale, a
// shaded neutral zone from 90–110%, a filled bar for the current value. Most
// information-dense of the three: every nutrient's exact position relative to the band is
// visible at a glance, in a plain list (no grouping/sorting).
export function ComparisonA({
  items,
  t,
  panelClass,
  sheenClass,
}: {
  items: ResolvedNrvItem[];
  t: C6TextPalette;
  panelClass: string;
  tileClass: string;
  sheenClass: string;
}) {
  const SCALE_MAX = 150;
  const bandLeft = (90 / SCALE_MAX) * 100;
  const bandWidth = (20 / SCALE_MAX) * 100;

  return (
    <div className={panelClass}>
      <div className={sheenClass} aria-hidden="true" />
      <h2 className="text-base font-semibold" style={{ color: t.heading }}>
        More of / less of
      </h2>
      <ComparisonCaption t={t} />

      <div className="mt-5 flex flex-col gap-4">
        {items.map((item) => {
          const style = item.direction === "on-target" ? undefined : DIRECTION_STYLE[item.direction];
          const clampedPct = Math.min(SCALE_MAX, item.pct);
          const fillWidth = (clampedPct / SCALE_MAX) * 100;

          return (
            <div key={item.nutrient}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium" style={{ color: t.body }}>
                  {item.nutrient}
                </span>
                <span
                  className="text-sm font-semibold tabular-nums"
                  style={{ color: style ? undefined : t.mutedLabel }}
                >
                  <span className={style?.text}>{item.pct}%</span>
                </span>
              </div>
              <div className="relative mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[#ece7f6]">
                <div
                  className="absolute inset-y-0 rounded-full bg-white/70"
                  style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
                  aria-hidden="true"
                />
                <div
                  className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${
                    style ? style.bar : "from-violet-200 to-violet-300"
                  }`}
                  style={{ width: `${fillWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative mt-2 h-3 w-full text-[0.65rem]" style={{ color: t.faint }}>
        <span className="absolute left-0">0%</span>
        <span className="absolute" style={{ left: `${(100 / SCALE_MAX) * 100}%`, transform: "translateX(-50%)" }}>
          100%
        </span>
        <span className="absolute right-0">150%</span>
      </div>
    </div>
  );
}
