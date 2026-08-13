import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Beef, Droplet, Wheat } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { AppShell, GlassPanel } from "@/components/shell";
import { theme } from "@/lib/theme";
import { trpc } from "@/lib/trpc";
import type { InsightsPeriodSnapshot, NrvComparisonItem } from "@/lib/router-types";

type Period = "today" | "week";

// Same rose/amber/violet macro family as the dashboard (dashboard-screen.tsx's
// MACRO_META) — kept as a separate copy for the same reason caloriesPerGram
// is: the client only ever imports *types* from src/server, never values.
const MACRO_META = {
  protein: { label: "Protein", icon: Beef, chartColor: "#fb7185" },
  carbs: { label: "Carbs", icon: Wheat, chartColor: "#fbbf24" },
  fat: { label: "Fat", icon: Droplet, chartColor: "#a78bfa" },
} as const;

// Must match src/server/insights/insights.ts's implicit 4/4/9 kcal-per-gram
// scaling (same values dashboard-screen.tsx duplicates for the same reason).
const caloriesPerGram = { protein: 4, carbs: 4, fat: 9 } as const;

// Direction styling mirrors prototype/insights-look's comparison-shared.tsx:
// amber for "get more of" (same family as the carbs chip), cyan for "get
// less of" (same family as the hero bar's cyan endpoint), on-target bare.
const DIRECTION_STYLE = {
  more: { heading: "Get more of", text: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-200" },
  less: { heading: "Get less of", text: "text-cyan-700", bg: "bg-cyan-50", ring: "ring-cyan-200" },
} as const;

const GROUP_ORDER = ["more", "less", "on-target"] as const;

export function InsightsScreen({ onBack }: { onBack: () => void }) {
  const [period, setPeriod] = useState<Period>("today");
  const insightsQuery = useQuery(trpc.insights.get.queryOptions());

  return (
    <AppShell activeTab="insights" showNav={false}>
      <button
        type="button"
        aria-label="Back to dashboard"
        onClick={onBack}
        className="mb-3 grid h-9 w-9 place-items-center rounded-full bg-white/50 ring-1 ring-inset ring-white/70 backdrop-blur-xl transition-transform active:scale-95"
      >
        <ArrowLeft className="h-4 w-4" style={{ color: theme.text.body }} strokeWidth={2.25} />
      </button>
      <h1 className="font-display text-[2rem] leading-[1.05] tracking-[-0.02em]" style={{ color: theme.text.heading }}>
        Insights
      </h1>

      <div className="mt-5 flex w-fit items-center gap-1 rounded-full bg-white/40 p-1 ring-1 ring-inset ring-white/70 backdrop-blur-xl">
        {(["today", "week"] as Period[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setPeriod(key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              period === key ? `bg-gradient-to-br ${theme.navButtonGradient} text-white` : ""
            }`}
            style={period === key ? undefined : { color: theme.text.mutedLabel }}
          >
            {key === "today" ? "Day" : "Week"}
          </button>
        ))}
      </div>

      {insightsQuery.isPending && (
        <GlassPanel className="mt-5">
          <p className="text-sm" style={{ color: theme.text.label }}>
            Loading insights…
          </p>
        </GlassPanel>
      )}

      {insightsQuery.isError && (
        <GlassPanel className="mt-5 flex flex-col items-start gap-3">
          <p className="text-sm" style={{ color: theme.text.body }}>
            Couldn't load insights: {insightsQuery.error.message}
          </p>
          <Button onClick={() => insightsQuery.refetch()}>Retry</Button>
        </GlassPanel>
      )}

      {insightsQuery.data && (
        <InsightsContent snapshot={insightsQuery.data[period]} />
      )}

      <p className="mt-5 px-1 text-center text-xs italic" style={{ color: theme.text.faint }}>
        *Against UK/EU Nutrient Reference Values
      </p>
    </AppShell>
  );
}

function InsightsContent({ snapshot }: { snapshot: InsightsPeriodSnapshot }) {
  const macroSplitData = (
    [
      { key: "protein" as const, grams: snapshot.macroSplit.proteinG },
      { key: "carbs" as const, grams: snapshot.macroSplit.carbsG },
      { key: "fat" as const, grams: snapshot.macroSplit.fatG },
    ] as const
  ).map(({ key, grams }) => ({
    key,
    name: MACRO_META[key].label,
    value: grams * caloriesPerGram[key],
    color: MACRO_META[key].chartColor,
  }));
  const macroSplitTotalKcal = macroSplitData.reduce((sum, m) => sum + m.value, 0);

  return (
    <>
      <GlassPanel className="mt-5">
        <h2 className="text-base font-semibold" style={{ color: theme.text.heading }}>
          Macro split
        </h2>
        {macroSplitTotalKcal > 0 ? (
          <div className="mt-2 flex items-center gap-4">
            <div className="h-32 w-32 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={macroSplitData} dataKey="value" nameKey="name" innerRadius={38} outerRadius={58} strokeWidth={0}>
                    {macroSplitData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${Math.round(Number(value))} kcal`, ""]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {macroSplitData.map((entry) => (
                <div key={entry.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2" style={{ color: theme.text.body }}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    {entry.name}
                  </span>
                  <span style={{ color: theme.text.muted }}>
                    {Math.round((entry.value / macroSplitTotalKcal) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm" style={{ color: theme.text.muted }}>
            Log a meal to see your macro split.
          </p>
        )}
      </GlassPanel>

      <GlassPanel className="mt-3 mb-3">
        <h2 className="text-base font-semibold" style={{ color: theme.text.heading }}>
          Nutrient balance
        </h2>
        <div className="mt-5 flex flex-col gap-5">
          {GROUP_ORDER.map((direction) => {
            const groupItems = snapshot.nrvItems
              .filter((item) => item.direction === direction)
              .sort((a, b) => b.distanceFromTarget - a.distanceFromTarget);
            if (groupItems.length === 0) return null;
            const style = direction === "on-target" ? undefined : DIRECTION_STYLE[direction];
            return (
              <div key={direction}>
                <h3
                  className={`text-xs font-semibold tracking-wide uppercase ${style?.text ?? ""}`}
                  style={style ? undefined : { color: theme.text.mutedLabel }}
                >
                  {style?.heading ?? "On target"}
                </h3>
                <div className="mt-2.5 flex flex-col gap-2">
                  {groupItems.map((item) => (
                    <NrvRow key={item.code} item={item} style={style} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </GlassPanel>
    </>
  );
}

function NrvRow({
  item,
  style,
}: {
  item: NrvComparisonItem;
  style?: { text: string; bg: string; ring: string };
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium" style={{ color: theme.text.body }}>
        {item.label}
      </span>
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset tabular-nums ${
          style ? `${style.bg} ${style.text} ${style.ring}` : "bg-white/50"
        }`}
        style={style ? undefined : { color: theme.text.mutedLabel }}
      >
        {item.pct}%
      </span>
    </div>
  );
}
