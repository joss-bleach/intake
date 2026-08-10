import { useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import type { ComponentType } from "react";
import { BottomNav, C6Backdrop, useC6Chrome } from "./c6-shared";
import { THEME } from "./theme";
import { insightsData } from "./data";
import type { Period } from "./data";
import { resolveNrvItems, type ResolvedNrvItem } from "./comparison-shared";
import { MacroDonut } from "./MacroDonut";
import type { C6TextPalette } from "./c6-shared";

export interface ComparisonProps {
  items: ResolvedNrvItem[];
  t: C6TextPalette;
  panelClass: string;
  tileClass: string;
  sheenClass: string;
}

// Everything here — header, donut, Day/Week toggle, nav — stays constant across the three
// comparison-block variants; only the ComparisonBlock component passed in changes.
export function InsightsShell({ ComparisonBlock }: { ComparisonBlock: ComponentType<ComparisonProps> }) {
  const [period, setPeriod] = useState<Period>("today");
  const { t, panelClass, tileClass, sheenClass, showGrain } = useC6Chrome(THEME);

  const macros = insightsData.macros[period];
  const calories = insightsData.calories[period];
  const nrvItems = resolveNrvItems(insightsData.nrv, period);

  return (
    <div className={`relative isolate min-h-full overflow-hidden ${THEME.pageBg} pb-24`}>
      <C6Backdrop theme={THEME} showGrain={showGrain} />

      <motion.div
        className="relative flex flex-col gap-7 px-5 pb-12 pt-14"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Header + Day/Week toggle */}
        <div>
          <button
            type="button"
            aria-label="Back to dashboard"
            className="mb-3 grid h-9 w-9 place-items-center rounded-full bg-white/50 ring-1 ring-inset ring-white/70 backdrop-blur-xl transition-transform active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" style={{ color: t.body }} strokeWidth={2.25} />
          </button>
          <h1 className="font-display text-[2rem] leading-[1.05] tracking-[-0.02em]" style={{ color: t.heading }}>
            Insights
          </h1>
        </div>

        <div className="flex w-fit items-center gap-1 rounded-full bg-white/40 p-1 ring-1 ring-inset ring-white/70 backdrop-blur-xl">
          {(["today", "week"] as Period[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriod(key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                period === key
                  ? `bg-gradient-to-br ${THEME.navButtonGradient} text-white`
                  : ""
              }`}
              style={period === key ? undefined : { color: t.mutedLabel }}
            >
              {key === "today" ? "Day" : "Week"}
            </button>
          ))}
        </div>

        {/* Macro split — simple SVG donut, %-of-calories per macro */}
        <div className={panelClass}>
          <div className={sheenClass} aria-hidden="true" />
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold" style={{ color: t.heading }}>
              Macro split
            </h2>
            <span className="text-sm" style={{ color: t.mutedLabel }}>
              {calories.consumed.toLocaleString()} / {calories.goal.toLocaleString()} kcal
            </span>
          </div>
          <div className="mt-4">
            <MacroDonut macros={macros} t={t} />
          </div>
        </div>

        {/* More of / less of — the layout under test */}
        <ComparisonBlock items={nrvItems} t={t} panelClass={panelClass} tileClass={tileClass} sheenClass={sheenClass} />

        {/* Disclaimer — states the comparison's assumption plainly, once, at the foot of the
            screen rather than repeated as a caption under the comparison heading. */}
        <p className="px-1 text-center text-xs italic" style={{ color: t.faint }}>
          *Against UK/EU Nutrient reference values
        </p>
      </motion.div>

      <BottomNav theme={THEME} active="insights" />
    </div>
  );
}
