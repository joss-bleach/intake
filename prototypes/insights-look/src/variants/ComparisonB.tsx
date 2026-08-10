import type { C6TextPalette } from "../c6-shared";
import { DIRECTION_STYLE, type ResolvedNrvItem } from "../comparison-shared";
import type { NrvDirection } from "../data";

const GROUP_ORDER: { direction: NrvDirection; heading: string }[] = [
  { direction: "more", heading: "Get more of" },
  { direction: "less", heading: "Get less of" },
  { direction: "on-target", heading: "On target" },
];

// Variant B — grouped sections. Three headed groups, actionable ones first, each item
// sorted furthest-from-target first within its group so the nutrient most worth acting on
// leads. Most scannable of the three: no bars to read, just a name and a %-of-NRV badge.
export function ComparisonB({
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
  return (
    <div className={panelClass}>
      <div className={sheenClass} aria-hidden="true" />
      <h2 className="text-base font-semibold" style={{ color: t.heading }}>
        Nutrient balance
      </h2>

      <div className="mt-5 flex flex-col gap-5">
        {GROUP_ORDER.map((group) => {
          const groupItems = items
            .filter((item) => item.direction === group.direction)
            .sort((a, b) => b.distanceFromTarget - a.distanceFromTarget);
          if (groupItems.length === 0) return null;
          const style = group.direction === "on-target" ? undefined : DIRECTION_STYLE[group.direction];

          return (
            <div key={group.direction}>
              <h3
                className={`text-xs font-semibold tracking-wide uppercase ${style?.text ?? ""}`}
                style={style ? undefined : { color: t.mutedLabel }}
              >
                {group.heading}
              </h3>
              <div className="mt-2.5 flex flex-col gap-2">
                {groupItems.map((item) => (
                  <div key={item.nutrient} className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium" style={{ color: t.body }}>
                      {item.nutrient}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset tabular-nums ${
                        style ? `${style.bg} ${style.text} ${style.ring}` : "bg-white/50"
                      }`}
                      style={style ? undefined : { color: t.mutedLabel, boxShadow: `inset 0 0 0 1px ${t.faint}40` }}
                    >
                      {item.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
