import { Bell, BookOpen, Home, LineChart, Plus, User } from "lucide-react";
import type { dashboardData } from "../data";

// pastel-sparkline-raised-fab
// Skeleton: greeting header -> hero calorie ring card -> two pastel macro tiles
// (each its own progress element, real grams) -> 7-day streak bar strip -> floating
// pill nav broken by a raised circular FAB.

const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function initials(name: string) {
  return name.slice(0, 1).toUpperCase();
}

export function VariantB({ data }: { data: typeof dashboardData }) {
  const { today, streak, macros } = data;
  const pctOfGoal = Math.min(1, today.calories / today.goal);
  const pctLabel = Math.round((today.calories / today.goal) * 100);
  const ringOffset = RING_CIRCUMFERENCE * (1 - pctOfGoal);

  const macroByKey = Object.fromEntries(macros.map((m) => [m.key, m]));
  const tileA = [macroByKey.protein, macroByKey.carbs];
  const tileB = [macroByKey.fat, macroByKey.fiber];

  const maxStreakCal = Math.max(...streak.days.map((d) => Math.max(d.calories, d.goal)));

  return (
    <div className="min-h-full bg-gradient-to-b from-[#FBF7F1] via-[#F6F1FB] to-[#EEF2FC] pb-32">
      <div className="px-5 pt-7">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-medium text-slate-500">Good morning</p>
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">
              {data.userName}
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              aria-label="Notifications"
              className="grid h-10 w-10 place-items-center rounded-full bg-white text-slate-600 shadow-[0_2px_8px_-2px_rgba(30,20,60,0.15)]"
            >
              <Bell className="h-[18px] w-[18px]" strokeWidth={2} />
            </button>
            <div
              className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-sm font-semibold text-white shadow-[0_3px_10px_-2px_rgba(99,60,220,0.5)]"
              aria-hidden="true"
            >
              {initials(data.userName)}
            </div>
          </div>
        </div>

        {/* Hero: calories vs goal */}
        <div className="relative mt-6 overflow-hidden rounded-[28px] bg-gradient-to-br from-[#FFE7D2] via-[#FFDCE4] to-[#FBD8EE] p-5 shadow-[0_16px_32px_-16px_rgba(210,110,90,0.55)]">
          <div
            className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/25 blur-2xl"
            aria-hidden="true"
          />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <p className="text-[13px] font-medium text-orange-900/60">Calories today</p>
              <p className="mt-1 text-[40px] font-bold leading-none tracking-[-0.03em] text-slate-900">
                {today.calories.toLocaleString()}
                <span className="ml-1 text-base font-semibold text-orange-900/50">kcal</span>
              </p>
              <p className="mt-2 text-[13px] font-medium text-orange-900/70">
                {today.caloriesRemaining.toLocaleString()} kcal left ·{" "}
                {today.goal.toLocaleString()} goal
              </p>
            </div>

            <div className="relative h-[104px] w-[104px] shrink-0">
              <svg
                viewBox="0 0 100 100"
                className="h-full w-full -rotate-90"
                role="img"
                aria-label={`${pctLabel}% of calorie goal reached`}
              >
                <circle
                  cx="50"
                  cy="50"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth="10"
                />
                <circle
                  cx="50"
                  cy="50"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="#C2410C"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={ringOffset}
                  className="[animation:ring-fill_1.1s_cubic-bezier(0.16,1,0.3,1)_backwards]"
                  style={{ ["--ring-dash" as string]: RING_CIRCUMFERENCE }}
                />
              </svg>
              <div className="absolute inset-0 grid place-items-center">
                <span className="text-lg font-bold text-slate-900">{pctLabel}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Macro tiles */}
        <div className="mt-4 grid grid-cols-2 gap-3.5">
          <MacroTile
            title="Protein & carbs"
            fromClass="from-[#E6E2FB]"
            toClass="to-[#DCE7FC]"
            headingClass="text-indigo-950"
            subClass="text-indigo-900/55"
            barTrackClass="bg-indigo-900/10"
            macros={tileA}
            barColors={["#6D4CD6", "#3D5CD9"]}
          />
          <MacroTile
            title="Fat & fibre"
            fromClass="from-[#DCF3E8]"
            toClass="to-[#EEF8DC]"
            headingClass="text-emerald-950"
            subClass="text-emerald-900/55"
            barTrackClass="bg-emerald-900/10"
            macros={tileB}
            barColors={["#0F8A5F", "#79A62A"]}
          />
        </div>

        {/* 7-day streak strip */}
        <div className="mt-4 rounded-[24px] border border-slate-900/[0.04] bg-white p-4 shadow-[0_10px_24px_-16px_rgba(30,20,60,0.35)]">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-slate-900">Logging streak</p>
            <p className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
              {streak.currentDays} days
            </p>
          </div>
          <div className="mt-4 flex items-end justify-between gap-2">
            {streak.days.map((day) => {
              const heightPct = Math.max(
                14,
                Math.round((Math.max(day.calories, 1) / maxStreakCal) * 100),
              );
              return (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-14 w-full items-end justify-center">
                    {day.logged ? (
                      <div
                        className="w-full max-w-[18px] rounded-full bg-gradient-to-t from-violet-500 to-indigo-400"
                        style={{ height: `${heightPct}%` }}
                      />
                    ) : (
                      <div
                        className="w-full max-w-[18px] rounded-full border-[1.5px] border-dashed border-slate-300"
                        style={{ height: "20%" }}
                      />
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-slate-400">{day.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating pill nav with raised FAB */}
      <div className="fixed inset-x-0 bottom-6 z-10 flex justify-center px-6">
        <nav className="relative flex w-full max-w-[330px] items-center justify-between rounded-full bg-white/90 px-6 py-3 shadow-[0_14px_30px_-12px_rgba(30,20,60,0.4)] backdrop-blur-md">
          <NavIcon icon={Home} label="Home" active />
          <NavIcon icon={LineChart} label="Insights" />
          <span className="w-14" aria-hidden="true" />
          <NavIcon icon={BookOpen} label="Log" />
          <NavIcon icon={User} label="Profile" />

          <button
            type="button"
            aria-label="Log food"
            className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_10px_20px_-6px_rgba(99,60,220,0.65)] transition-transform active:scale-95"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </button>
        </nav>
      </div>

      <style>{`
        @keyframes ring-fill {
          from { stroke-dashoffset: var(--ring-dash); }
        }
      `}</style>
    </div>
  );
}

function NavIcon({
  icon: Icon,
  label,
  active = false,
}: {
  icon: typeof Home;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${
        active ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
      }`}
    >
      <Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.4 : 2} />
    </button>
  );
}

function MacroTile({
  title,
  fromClass,
  toClass,
  headingClass,
  subClass,
  barTrackClass,
  macros,
  barColors,
}: {
  title: string;
  fromClass: string;
  toClass: string;
  headingClass: string;
  subClass: string;
  barTrackClass: string;
  macros: { label: string; grams: number; goalGrams: number }[];
  barColors: [string, string];
}) {
  return (
    <div
      className={`rounded-[24px] bg-gradient-to-br ${fromClass} ${toClass} p-4 shadow-[0_10px_22px_-16px_rgba(30,20,60,0.4)]`}
    >
      <p className={`text-[12px] font-semibold ${headingClass}`}>{title}</p>
      <div className="mt-3 flex flex-col gap-3">
        {macros.map((macro, i) => {
          const pct = Math.min(100, Math.round((macro.grams / macro.goalGrams) * 100));
          return (
            <div key={macro.label}>
              <div className="flex items-baseline justify-between">
                <span className={`text-[12px] font-medium ${subClass}`}>{macro.label}</span>
                <span className={`text-[12px] font-semibold ${headingClass}`}>
                  {macro.grams}
                  <span className={`font-normal ${subClass}`}>/{macro.goalGrams}g</span>
                </span>
              </div>
              <div className={`mt-1 h-1.5 w-full overflow-hidden rounded-full ${barTrackClass}`}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: barColors[i] }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
