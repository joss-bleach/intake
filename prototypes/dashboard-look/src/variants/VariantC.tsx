import { motion } from "motion/react";
import { Beef, CircleDashed, Droplet, Flame, Leaf, Wheat } from "lucide-react";
import type { dashboardData } from "../data";

const MACRO_STYLE: Record<
  string,
  { icon: typeof Beef; bar: string; chip: string; tint: string }
> = {
  protein: {
    icon: Beef,
    bar: "from-rose-300 to-rose-400",
    chip: "bg-rose-50 text-rose-600",
    tint: "text-rose-500",
  },
  carbs: {
    icon: Wheat,
    bar: "from-amber-200 to-amber-400",
    chip: "bg-amber-50 text-amber-600",
    tint: "text-amber-500",
  },
  fat: {
    icon: Droplet,
    bar: "from-violet-300 to-violet-400",
    chip: "bg-violet-50 text-violet-600",
    tint: "text-violet-500",
  },
  fiber: {
    icon: Leaf,
    bar: "from-emerald-200 to-emerald-400",
    chip: "bg-emerald-50 text-emerald-600",
    tint: "text-emerald-500",
  },
};

export function VariantC({ data }: { data: typeof dashboardData }) {
  const { today, streak, macros, nrv } = data;
  const eatenPct = Math.min(100, Math.round((today.calories / today.goal) * 100));
  const maxDayCalories = Math.max(...streak.days.map((d) => Math.max(d.calories, d.goal)));
  const todayLabel = streak.days[streak.days.length - 1]?.label;

  return (
    <div className="relative isolate min-h-full overflow-hidden bg-[#f6f2fb]">
      {/* Gradient-blob backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute -left-24 -top-16 h-72 w-72 rounded-full bg-violet-300/60 blur-3xl"
          animate={{ x: [0, 18, 0], y: [0, 14, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -right-28 top-40 h-80 w-80 rounded-full bg-fuchsia-200/60 blur-3xl"
          animate={{ x: [0, -16, 0], y: [0, 20, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-0 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-sky-200/50 blur-3xl"
          animate={{ x: [0, 14, 0], y: [0, -12, 0], scale: [1, 1.06, 1] }}
          transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-white/40" />
      </div>

      <motion.div
        className="relative flex flex-col gap-7 px-5 pb-12 pt-14"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Greeting */}
        <div className="flex items-end justify-between">
          <h1 className="font-display text-[2rem] leading-[1.05] tracking-[-0.02em] text-[#2f2a42]">
            Good afternoon,
            <br />
            {data.userName}
          </h1>
          <div className="mb-1 flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5 shadow-[0_8px_24px_-10px_rgba(124,58,237,0.35)] ring-1 ring-white/70 backdrop-blur-md">
            <Flame className="h-4 w-4 text-orange-400" strokeWidth={2.25} />
            <span className="text-sm font-semibold text-[#4a4360]">{streak.currentDays}-day</span>
          </div>
        </div>

        {/* Today panel: calories + macros, one composed card */}
        <div className="rounded-[2rem] bg-white/65 p-6 shadow-[0_24px_60px_-20px_rgba(124,58,237,0.35)] ring-1 ring-white/70 backdrop-blur-xl">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-sm text-[#847c9c]">Logged today</p>
              <p className="mt-1 font-display text-4xl tracking-[-0.02em] text-[#2f2a42]">
                {today.calories.toLocaleString()}
                <span className="ml-1 text-lg font-normal text-[#847c9c]">kcal</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-[#847c9c]">Goal</p>
              <p className="mt-1 text-lg font-medium text-[#4a4360]">
                {today.goal.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-[#ece7f6]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-400 via-fuchsia-300 to-sky-300"
              style={{ width: `${eatenPct}%` }}
            />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[#6f6685]">
            {data.userName}, you've got{" "}
            <span className="font-semibold text-[#4a4360]">
              {today.caloriesRemaining.toLocaleString()} kcal
            </span>{" "}
            of headroom left before your next meal.
          </p>

          {/* Macro split */}
          <div className="mt-6 flex flex-col gap-4 border-t border-[#ece7f6] pt-5">
            {macros.map((macro) => {
              const style = MACRO_STYLE[macro.key];
              const Icon = style.icon;
              const pct = Math.min(100, Math.round((macro.grams / macro.goalGrams) * 100));
              return (
                <div key={macro.key} className="flex items-center gap-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style.chip}`}>
                    <Icon className="h-4 w-4" strokeWidth={2.25} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-[#4a4360]">{macro.label}</span>
                      <span className="shrink-0 text-xs text-[#918aa4]">
                        {macro.grams}
                        <span className="text-[#b3adc2]"> / {macro.goalGrams}g</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#ece7f6]">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${style.bar}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 7-day streak */}
        <div className="rounded-[2rem] bg-white/65 p-6 shadow-[0_24px_60px_-20px_rgba(124,58,237,0.3)] ring-1 ring-white/70 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#2f2a42]">This week</h2>
            <span className="text-sm text-[#918aa4]">
              {streak.days.filter((d) => d.logged).length}/{streak.days.length} logged
            </span>
          </div>

          <div className="mt-5 flex items-end justify-between gap-2">
            {streak.days.map((day) => {
              const isToday = day.label === todayLabel && day.date === streak.days[streak.days.length - 1].date;
              const heightPct = day.logged ? Math.max(14, Math.round((day.calories / maxDayCalories) * 100)) : 0;
              return (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-24 w-full items-end justify-center">
                    {day.logged ? (
                      <div
                        className={`w-full max-w-6 rounded-full bg-gradient-to-t ${
                          isToday
                            ? "from-violet-400 to-fuchsia-300 shadow-[0_6px_16px_-4px_rgba(124,58,237,0.55)]"
                            : "from-violet-200 to-violet-300"
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-[#d8d2e6]">
                        <CircleDashed className="h-4 w-4 text-[#c3bcd6]" strokeWidth={2} />
                      </div>
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      isToday ? "text-[#3d3555]" : "text-[#a49cb8]"
                    }`}
                  >
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Nutrient balance strip */}
        {nrv && nrv.length > 0 && (
          <div className="rounded-[2rem] bg-white/50 p-5 shadow-[0_16px_40px_-18px_rgba(124,58,237,0.25)] ring-1 ring-white/60 backdrop-blur-xl">
            <h2 className="text-base font-semibold text-[#2f2a42]">Nutrient balance</h2>
            <div className="mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {nrv.map((item) => (
                <div
                  key={item.nutrient}
                  className="flex shrink-0 flex-col gap-0.5 rounded-2xl bg-white/70 px-3.5 py-2.5 ring-1 ring-white/70"
                >
                  <span className="text-xs font-medium text-[#4a4360]">{item.nutrient}</span>
                  <span
                    className={`text-xs ${
                      item.direction === "less"
                        ? "text-rose-500"
                        : item.direction === "more"
                          ? "text-amber-600"
                          : "text-emerald-600"
                    }`}
                  >
                    {item.pctOfNrv}% · {item.direction === "less" ? "ease off" : item.direction === "more" ? "eat more" : "on target"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
