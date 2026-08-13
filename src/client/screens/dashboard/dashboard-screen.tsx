import { useQuery } from "@tanstack/react-query";
import { Beef, Droplet, Flame, Plus, Wheat } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { AppShell, GlassPanel } from "@/components/shell";
import { reviewBadgeClass, theme } from "@/lib/theme";
import { trpc } from "@/lib/trpc";
import type { DashboardMealGroup, DashboardSnapshot, GoalsSnapshot } from "@/lib/router-types";

// Macro bar/chip/chart colours — locked to this rose/amber/violet family
// across the app (ported from prototype/dashboard-look's C6 variants), so a
// macro reads the same colour wherever it appears.
const MACRO_META = {
  protein: { label: "Protein", icon: Beef, bar: "from-rose-300 to-rose-400", chip: "bg-rose-50 text-rose-600", chartColor: "#fb7185" },
  carbs: { label: "Carbs", icon: Wheat, bar: "from-amber-200 to-amber-400", chip: "bg-amber-50 text-amber-600", chartColor: "#fbbf24" },
  fat: { label: "Fat", icon: Droplet, bar: "from-violet-300 to-violet-400", chip: "bg-violet-50 text-violet-600", chartColor: "#a78bfa" },
} as const;

const MEAL_LABELS = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
} satisfies Record<DashboardMealGroup["meal"], string>;

// Must match src/server/goals/macros.ts's caloriesPerGram — kept as a
// separate copy because the client only ever imports *types* from
// src/server (see router-types.ts), never runtime values.
const caloriesPerGram = { protein: 4, carbs: 4, fat: 9 } as const;

// `today.macros` (proteinG/carbsG/fatG) and `goals.macros`
// (proteinGrams/carbsGrams/fatGrams) use different field-naming schemes —
// these per-macro accessors bridge that explicitly, so a renamed field is a
// compile error at the accessor, not a silent `undefined` from a dynamic
// `${key}G` template-literal key lookup.
const TODAY_GRAMS = {
  protein: (macros: DashboardSnapshot["today"]["macros"]) => macros.proteinG,
  carbs: (macros: DashboardSnapshot["today"]["macros"]) => macros.carbsG,
  fat: (macros: DashboardSnapshot["today"]["macros"]) => macros.fatG,
} satisfies Record<keyof typeof MACRO_META, (macros: DashboardSnapshot["today"]["macros"]) => number>;

const GOAL_GRAMS = {
  protein: (macros: NonNullable<GoalsSnapshot>["macros"]) => macros.proteinGrams,
  carbs: (macros: NonNullable<GoalsSnapshot>["macros"]) => macros.carbsGrams,
  fat: (macros: NonNullable<GoalsSnapshot>["macros"]) => macros.fatGrams,
} satisfies Record<keyof typeof MACRO_META, (macros: NonNullable<GoalsSnapshot>["macros"]) => number>;

const weekdayLabel = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });

// The daily home screen (#53): remaining-first hero, equal macro bento,
// meal-grouped log, streak, and the two Recharts trend charts — all real
// data from the dashboard router (rolling 7-day aggregation) plus the goals
// snapshot already fetched at the app level (see App.tsx).
export function DashboardScreen({
  goals,
  onOpenProfile,
  onLogFood,
}: {
  goals: GoalsSnapshot;
  onOpenProfile: () => void;
  onLogFood?: () => void;
}) {
  const dashboardQuery = useQuery(trpc.dashboard.get.queryOptions());

  return (
    <AppShell activeTab="home" onProfile={onOpenProfile} onLogFood={onLogFood}>
      <div className="flex items-end justify-between">
        <h1
          className="font-display text-[2rem] leading-[1.05] tracking-[-0.02em]"
          style={{ color: theme.text.heading }}
        >
          Intake
        </h1>
        {dashboardQuery.data && dashboardQuery.data.streakDays > 0 && (
          <div className="mb-1 flex items-center gap-1.5 rounded-full bg-white/35 px-3 py-1.5 ring-1 ring-inset ring-white/70 backdrop-blur-xl">
            <Flame className="h-4 w-4 text-orange-400" strokeWidth={2.25} />
            <span className="text-sm font-semibold" style={{ color: theme.text.emphasisStrong }}>
              {dashboardQuery.data.streakDays}-day
            </span>
          </div>
        )}
      </div>

      {dashboardQuery.isPending && (
        <GlassPanel className="mt-7">
          <p className="text-sm" style={{ color: theme.text.label }}>
            Loading today…
          </p>
        </GlassPanel>
      )}

      {dashboardQuery.isError && (
        <GlassPanel className="mt-7 flex flex-col items-start gap-3">
          <p className="text-sm" style={{ color: theme.text.body }}>
            Couldn't load your day: {dashboardQuery.error.message}
          </p>
          <Button onClick={() => dashboardQuery.refetch()}>Retry</Button>
        </GlassPanel>
      )}

      {dashboardQuery.data && goals && (
        <DashboardContent data={dashboardQuery.data} goals={goals} onLogFood={onLogFood} />
      )}
    </AppShell>
  );
}

function DashboardContent({
  data,
  goals,
  onLogFood,
}: {
  data: DashboardSnapshot;
  goals: NonNullable<GoalsSnapshot>;
  onLogFood?: () => void;
}) {
  const caloriesRemaining = goals.calorieGoal - data.today.calories;
  const eatenPct = Math.min(100, Math.round((data.today.calories / goals.calorieGoal) * 100));

  const calorieChartData = data.calorieHistory.map((day) => ({
    date: day.date,
    label: weekdayLabel(day.date),
    calories: day.calories,
  }));

  const macroSplitTotalKcal =
    data.macroSplit.proteinG * caloriesPerGram.protein +
    data.macroSplit.carbsG * caloriesPerGram.carbs +
    data.macroSplit.fatG * caloriesPerGram.fat;

  const macroSplitData = (
    [
      { key: "protein" as const, grams: data.macroSplit.proteinG },
      { key: "carbs" as const, grams: data.macroSplit.carbsG },
      { key: "fat" as const, grams: data.macroSplit.fatG },
    ] as const
  ).map(({ key, grams }) => ({
    key,
    name: MACRO_META[key].label,
    value: grams * caloriesPerGram[key],
    color: MACRO_META[key].chartColor,
  }));

  return (
    <>
      {/* Hero panel: calories remaining is the headline, "kcal" folded inline */}
      <GlassPanel className="mt-7">
        <p className="text-sm" style={{ color: theme.text.label }}>
          Left to eat today
        </p>
        <p className="mt-3 font-display text-6xl leading-none tracking-[-0.02em]" style={{ color: theme.text.heading }}>
          {caloriesRemaining.toLocaleString()}
          <span className="ml-2 font-sans text-xl font-normal" style={{ color: theme.text.suffixLight }}>
            kcal
          </span>
        </p>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[#ece7f6]">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${theme.barGradient}`}
            style={{ width: `${eatenPct}%` }}
          />
        </div>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: theme.text.body }}>
          <span className="font-semibold" style={{ color: theme.text.emphasisStrong }}>
            {data.today.calories.toLocaleString()}
          </span>{" "}
          of {goals.calorieGoal.toLocaleString()} kcal logged so far.
        </p>
      </GlassPanel>

      {/* Macros — equal-sized bento grid, no macro visually privileged over another */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        {(["protein", "carbs", "fat"] as const).map((key) => {
          const meta = MACRO_META[key];
          const Icon = meta.icon;
          const grams = TODAY_GRAMS[key](data.today.macros);
          const goalGrams = GOAL_GRAMS[key](goals.macros);
          const pct = goalGrams > 0 ? Math.min(100, Math.round((grams / goalGrams) * 100)) : 0;
          return (
            <GlassPanel key={key} variant="tile">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${meta.chip}`}>
                <Icon className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <p className="mt-3 text-sm font-medium" style={{ color: theme.text.emphasisStrong }}>
                {meta.label}
              </p>
              <p className="mt-0.5 font-display text-xl tracking-[-0.01em]" style={{ color: theme.text.heading }}>
                {grams}
                <span className="ml-0.5 font-sans text-xs font-normal" style={{ color: theme.text.suffixLight }}>
                  /{goalGrams}g
                </span>
              </p>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[#ece7f6]">
                <div className={`h-full rounded-full bg-gradient-to-r ${meta.bar}`} style={{ width: `${pct}%` }} />
              </div>
            </GlassPanel>
          );
        })}
      </div>

      {/* Food log grouped by meal — plain divider rows, no per-row card */}
      <GlassPanel className="mt-3">
        <div className="flex flex-col gap-5">
          {data.meals.map((group) => (
            <div key={group.meal}>
              <h2 className="text-base font-semibold" style={{ color: theme.text.heading }}>
                {MEAL_LABELS[group.meal]}
              </h2>
              <div className="mt-3 flex flex-col">
                {group.items.length > 0 ? (
                  group.items.map((item, i) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-3 py-3 ${
                        i < group.items.length - 1 ? "border-b border-black/10" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" style={{ color: theme.text.foodName }}>
                          {item.foodName}
                          {item.confidence === "needs_review" && (
                            <span className={`ml-2 align-middle ${reviewBadgeClass}`}>estimated</span>
                          )}
                        </p>
                        <p className="text-xs" style={{ color: theme.text.muted }}>
                          {item.calories} kcal
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-start gap-3 py-3">
                    <span className="text-sm" style={{ color: theme.text.muted }}>
                      Not logged yet
                    </span>
                    <button
                      type="button"
                      aria-label={`Add ${MEAL_LABELS[group.meal].toLowerCase()}`}
                      onClick={onLogFood}
                      className={`ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br ${theme.navButtonGradient} text-white transition-transform active:scale-95`}
                    >
                      <Plus className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>

      {/* Calories vs. goal over time */}
      <GlassPanel className="mt-3">
        <h2 className="text-base font-semibold" style={{ color: theme.text.heading }}>
          Calories this week
        </h2>
        <div className="mt-4 h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={calorieChartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: theme.text.muted, fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "rgba(124, 58, 237, 0.08)" }}
                formatter={(value) => [`${Number(value)} kcal`, "Logged"]}
              />
              <ReferenceLine y={goals.calorieGoal} stroke="#a78bfa" strokeDasharray="4 4" />
              <Bar dataKey="calories" fill="#7c3aed" radius={[6, 6, 6, 6]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassPanel>

      {/* Macro split, rolling 7-day window */}
      <GlassPanel className="mt-3 mb-3">
        <h2 className="text-base font-semibold" style={{ color: theme.text.heading }}>
          Macro split this week
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
            Log a few meals this week to see your macro split.
          </p>
        )}
      </GlassPanel>
    </>
  );
}
