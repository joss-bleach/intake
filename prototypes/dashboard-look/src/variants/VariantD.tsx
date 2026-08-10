import { motion } from "motion/react";
import type { dashboardData, DayLog, Macro } from "../data";

// Per-macro colour language — sage / peach / lavender / gold, echoing the
// reference product's own macro-breakdown palette rather than a generic chart set.
const MACRO_STYLE: Record<
  Macro["key"],
  { bar: string; dot: string; value: string }
> = {
  protein: { bar: "bg-[#93AC7C]", dot: "bg-[#93AC7C]", value: "text-[#5C7440]" },
  carbs: { bar: "bg-[#E6A672]", dot: "bg-[#E6A672]", value: "text-[#B9702F]" },
  fat: { bar: "bg-[#B6A8DE]", dot: "bg-[#B6A8DE]", value: "text-[#71609F]" },
  fiber: { bar: "bg-[#E3C15E]", dot: "bg-[#E3C15E]", value: "text-[#9C7A1E]" },
};

function DayPill({ day, isToday }: { day: DayLog; isToday: boolean }) {
  const ratio = day.goal > 0 ? Math.min(1, day.calories / day.goal) : 0;
  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <div className="flex h-14 w-full items-end justify-center rounded-full bg-[#f1e9da] px-0.5 pb-0.5">
        <div
          className={
            isToday
              ? "w-full rounded-full bg-[#1F3A2C]"
              : day.logged
                ? "w-full rounded-full bg-[#C9BBA0]"
                : "w-full rounded-full border border-dashed border-[#d8cbb4]"
          }
          style={{ height: day.logged ? `${Math.max(18, ratio * 100)}%` : "18%" }}
        />
      </div>
      <span
        className={
          isToday
            ? "font-serif text-[13px] font-medium text-[#1F3A2C]"
            : "text-[12px] text-[#a39685]"
        }
      >
        {day.label}
      </span>
    </div>
  );
}

export function VariantD({ data }: { data: typeof dashboardData }) {
  const { userName, today, streak, macros, nrv } = data;
  const totalGrams = macros.reduce((sum, m) => sum + m.grams, 0);
  const todayLabel = streak.days[streak.days.length - 1];
  const moreOf = nrv.filter((n) => n.direction === "more").slice(0, 3);
  const lessOf = nrv.filter((n) => n.direction === "less").slice(0, 2);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#f6dfc9] via-[#f7efe1] to-[#f7efe1] pb-12">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="px-5 pt-14 pb-2">
          <h1 className="font-serif text-[27px] leading-tight text-[#241f1a]">
            Good afternoon, {userName}
          </h1>
          <p className="mt-1 text-[13px] text-[#a39685]">
            {todayLabel.date} &middot; day {streak.currentDays} of your streak
          </p>
        </header>

        <div className="mt-4 flex flex-col gap-4 px-5">
          {/* Calories + macro split, composed as one card so they read as one story */}
          <section className="rounded-[28px] border border-[#e6dac6] bg-white p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[#a39685]">
                Calories today
              </span>
              <span className="text-[11px] text-[#a39685]">
                {today.caloriesRemaining} kcal left
              </span>
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-serif text-[58px] leading-none tracking-tight text-[#1F3A2C]">
                {today.calories.toLocaleString()}
              </span>
              <span className="text-[15px] text-[#a39685]">
                / {today.goal.toLocaleString()} kcal
              </span>
            </div>

            <div className="mt-6 flex h-2 gap-[3px] overflow-hidden rounded-full">
              {macros.map((m) => (
                <div
                  key={m.key}
                  className={`${MACRO_STYLE[m.key].bar} h-full first:rounded-l-full last:rounded-r-full`}
                  style={{ width: `${totalGrams ? (m.grams / totalGrams) * 100 : 0}%` }}
                />
              ))}
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2">
              {macros.map((m) => (
                <div key={m.key} className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[#a39685]">
                    <span className={`h-1.5 w-1.5 rounded-full ${MACRO_STYLE[m.key].dot}`} />
                    {m.label}
                  </span>
                  <span className="font-serif text-[17px] text-[#241f1a]">
                    {m.grams}
                    <span className="text-[12px] text-[#a39685]">/{m.goalGrams}g</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Macro goals detail */}
          <section className="rounded-[28px] border border-[#e6dac6] bg-white p-5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[#a39685]">
              Macro goals
            </span>
            <div className="mt-4 flex flex-col gap-4">
              {macros.map((m) => {
                const pct = Math.min(100, Math.round((m.grams / m.goalGrams) * 100));
                return (
                  <div key={m.key}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[14px] text-[#241f1a]">{m.label}</span>
                      <span className={`text-[13px] ${MACRO_STYLE[m.key].value}`}>
                        {m.grams}g <span className="text-[#a39685]">of {m.goalGrams}g</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#f1e9da]">
                      <div
                        className={`h-full rounded-full ${MACRO_STYLE[m.key].bar}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 7-day streak */}
          <section className="rounded-[28px] border border-[#e6dac6] bg-white p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[#a39685]">
                Logging streak
              </span>
              <span className="rounded-full bg-[#1F3A2C] px-3 py-1 text-[12px] font-medium text-[#f7efe1]">
                {streak.currentDays} days
              </span>
            </div>
            <div className="mt-5 flex gap-2">
              {streak.days.map((day, i) => (
                <DayPill key={day.date} day={day} isToday={i === streak.days.length - 1} />
              ))}
            </div>
          </section>

          {/* Nutrients worth noticing */}
          {(moreOf.length > 0 || lessOf.length > 0) && (
            <section className="rounded-[28px] border border-[#e6dac6] bg-white p-5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[#a39685]">
                Worth noticing
              </span>
              <div className="mt-4 flex flex-col gap-3">
                {moreOf.map((n) => (
                  <div key={n.nutrient} className="flex items-center justify-between">
                    <span className="text-[14px] text-[#241f1a]">
                      Getting more {n.nutrient.toLowerCase()} would help
                    </span>
                    <span className="text-[13px] text-[#a39685]">{n.pctOfNrv}%</span>
                  </div>
                ))}
                {lessOf.map((n) => (
                  <div key={n.nutrient} className="flex items-center justify-between">
                    <span className="text-[14px] text-[#241f1a]">
                      Easing off {n.nutrient.toLowerCase()} would help
                    </span>
                    <span className="text-[13px] text-[#a39685]">{n.pctOfNrv}%</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </motion.div>
    </div>
  );
}
