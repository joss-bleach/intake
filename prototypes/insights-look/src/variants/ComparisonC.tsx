import type { C6TextPalette } from "../c6-shared";
import { ComparisonCaption, DIRECTION_STYLE, type ResolvedNrvItem } from "../comparison-shared";

const SCALE_MAX = 150;
const SIZE = 72;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Variant C — bento gauge tiles. A 2-column grid of small tiles echoing the dashboard's
// macro bento-tile language, each with a compact circular gauge showing %-of-NRV. Most
// visually consistent with the dashboard, but least text-dense of the three — no group
// labels or numeric scale, just the gauge and a coloured accent when it's past the band.
export function ComparisonC({
  items,
  t,
  tileClass,
  sheenClass,
}: {
  items: ResolvedNrvItem[];
  t: C6TextPalette;
  panelClass: string;
  tileClass: string;
  sheenClass: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold" style={{ color: t.heading }}>
          More of / less of
        </h2>
        <ComparisonCaption t={t} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => {
          const style = item.direction === "on-target" ? undefined : DIRECTION_STYLE[item.direction];
          const clampedPct = Math.min(SCALE_MAX, item.pct);
          const fraction = clampedPct / SCALE_MAX;
          const dash = fraction * CIRCUMFERENCE;

          return (
            <div key={item.nutrient} className={tileClass}>
              <div className={sheenClass} aria-hidden="true" />
              <div className="flex items-center gap-3">
                <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
                  <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
                    <circle
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={RADIUS}
                      fill="none"
                      stroke="#ece7f6"
                      strokeWidth={STROKE}
                    />
                    <circle
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={RADIUS}
                      fill="none"
                      stroke={style ? style.solid : "#c4bcdd"}
                      strokeWidth={STROKE}
                      strokeLinecap="round"
                      strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      className="text-sm font-semibold tabular-nums"
                      style={{ color: style ? style.solid : t.emphasisStrong }}
                    >
                      {item.pct}%
                    </span>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" style={{ color: t.body }}>
                    {item.nutrient}
                  </p>
                  <p
                    className={`text-xs font-medium ${style?.text ?? ""}`}
                    style={style ? undefined : { color: t.muted }}
                  >
                    {style ? style.label : "On target"}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
