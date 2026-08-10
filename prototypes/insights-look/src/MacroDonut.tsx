import { MACRO_STYLE } from "./c6-shared";
import type { C6TextPalette } from "./c6-shared";
import type { MacroLog } from "./data";
import { MACRO_KCAL_PER_GRAM } from "./data";

// Segment strokes reuse the locked MACRO_STYLE bar gradients' end colour flattened to a
// single hex, since SVG stroke can't take a Tailwind gradient class directly.
const SEGMENT_COLOR: Record<string, string> = {
  protein: "#fb7185", // rose-400
  carbs: "#fbbf24", // amber-400
  fat: "#a78bfa", // violet-400
  fiber: "#34d399", // emerald-400
};

// Simple SVG donut, no chart library — segments in the locked macro colours, sized by
// %-of-calories per macro for the selected period.
export function MacroDonut({ macros, t }: { macros: MacroLog[]; t: C6TextPalette }) {
  const withKcal = macros.map((m) => ({
    ...m,
    kcal: m.grams * MACRO_KCAL_PER_GRAM[m.key],
  }));
  const totalKcal = withKcal.reduce((sum, m) => sum + m.kcal, 0) || 1;

  const size = 152;
  const stroke = 20;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  let cursor = 0;
  const segments = withKcal.map((m) => {
    const fraction = m.kcal / totalKcal;
    const dash = fraction * circumference;
    const seg = {
      key: m.key,
      dasharray: `${dash} ${circumference - dash}`,
      dashoffset: -cursor,
      color: SEGMENT_COLOR[m.key],
      pct: Math.round(fraction * 100),
    };
    cursor += dash;
    return seg;
  });

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#ece7f6" strokeWidth={stroke} />
          {segments.map((seg) => (
            <circle
              key={seg.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={seg.dasharray}
              strokeDashoffset={seg.dashoffset}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl leading-none tracking-[-0.01em]" style={{ color: t.heading }}>
            {Math.round(totalKcal)}
          </span>
          <span className="mt-0.5 text-[0.65rem] font-medium" style={{ color: t.suffixLight }}>
            kcal from macros
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {segments.map((seg) => {
          const macro = withKcal.find((m) => m.key === seg.key)!;
          const style = MACRO_STYLE[macro.key];
          return (
            <div key={seg.key} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-br ${style.bar}`} />
              <span className="flex-1 text-sm font-medium" style={{ color: t.body }}>
                {macro.label}
              </span>
              <span className="text-sm font-semibold" style={{ color: t.emphasisStrong }}>
                {seg.pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
