import { useMemo } from "react";
import { motion } from "motion/react";
import { Droplets, Flame, Wheat, Leaf, Beef } from "lucide-react";
import type { dashboardData } from "../data";

const MACRO_ICON: Record<string, typeof Beef> = {
  protein: Beef,
  carbs: Wheat,
  fat: Droplets,
  fiber: Leaf,
};

export function VariantA({ data }: { data: typeof dashboardData }) {
  const { today, streak, macros } = data;

  const pctEaten = Math.min(100, Math.round((today.calories / today.goal) * 100));
  const ringCircumference = 2 * Math.PI * 54;
  const ringOffset = ringCircumference * (1 - pctEaten / 100);

  const firstName = data.userName;

  const longestBar = useMemo(
    () => Math.max(...macros.map((m) => Math.max(m.grams, m.goalGrams))),
    [macros],
  );

  return (
    <div className="relative min-h-full overflow-hidden bg-[#1c2b2a] text-white">
      {/* ---- synthesized photographic backdrop ---- */}
      <div className="pointer-events-none absolute inset-0">
        {/* base warm-to-cool gradient wash, standing in for graded light */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(160deg, #24413e 0%, #1a2e2d 32%, #2a2440 62%, #3a2a2e 100%)",
          }}
        />
        {/* soft organic color blobs, blurred like an out-of-focus photo */}
        <motion.div
          className="absolute -top-24 -left-16 h-80 w-80 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(129,212,190,0.55) 0%, rgba(129,212,190,0) 70%)",
            filter: "blur(40px)",
          }}
          animate={{ x: [0, 14, 0], y: [0, 10, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-40 -right-24 h-96 w-96 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(244,208,163,0.4) 0%, rgba(244,208,163,0) 70%)",
            filter: "blur(48px)",
          }}
          animate={{ x: [0, -16, 0], y: [0, 16, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-10 left-1/4 h-72 w-72 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(196,140,214,0.32) 0%, rgba(196,140,214,0) 70%)",
            filter: "blur(44px)",
          }}
          animate={{ x: [0, 10, 0], y: [0, -14, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <div
          className="absolute -bottom-32 right-0 h-80 w-72 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(60,120,110,0.5) 0%, rgba(60,120,110,0) 72%)",
            filter: "blur(50px)",
          }}
        />
        {/* mossy vignette + top light shaft, for depth */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.45) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255,255,255,0.12), transparent 60%)",
          }}
        />
        {/* subtle grain via repeating gradient, keeps the "photo" from looking flat/digital */}
        <div
          className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, #fff 0px, transparent 1px, transparent 2px), repeating-linear-gradient(90deg, #fff 0px, transparent 1px, transparent 2px)",
          }}
        />
      </div>

      {/* ---- content ---- */}
      <div className="relative flex flex-col gap-6 px-5 pb-10 pt-14">
        <header className="flex items-baseline justify-between">
          <div>
            <p className="font-serif text-[1.7rem] leading-none tracking-tight text-white">
              Good evening, {firstName}
            </p>
            <p className="mt-1.5 text-[0.8rem] text-white/70">
              {today.caloriesRemaining} kcal left to reach today's goal
            </p>
          </div>
        </header>

        {/* ---- calories vs goal, hero glass panel ---- */}
        <motion.section
          className="relative overflow-hidden rounded-[1.75rem] border border-white/25 bg-white/10 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-2xl"
          animate={{ boxShadow: [
            "0 8px 32px rgba(0,0,0,0.35)",
            "0 8px 40px rgba(129,212,190,0.18)",
            "0 8px 32px rgba(0,0,0,0.35)",
          ] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 40%)",
            }}
          />
          <div className="relative flex items-center gap-5">
            <div className="relative h-32 w-32 shrink-0">
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  fill="none"
                  stroke="rgba(255,255,255,0.18)"
                  strokeWidth="9"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  fill="none"
                  stroke="url(#calorieGradient)"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                />
                <defs>
                  <linearGradient id="calorieGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#9fe6cf" />
                    <stop offset="100%" stopColor="#f4d0a3" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-serif text-[1.55rem] leading-none text-white">
                  {today.calories.toLocaleString()}
                </span>
                <span className="mt-1 text-[0.65rem] uppercase tracking-[0.14em] text-white/65">
                  of {today.goal.toLocaleString()} kcal
                </span>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-2.5">
              <div className="flex items-center gap-2 text-white/85">
                <Flame className="h-4 w-4 shrink-0 text-[#f4d0a3]" strokeWidth={1.75} />
                <p className="text-sm">
                  <span className="font-medium text-white">{today.caloriesRemaining} kcal</span>{" "}
                  remaining today
                </p>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#9fe6cf] to-[#f4d0a3]"
                  style={{ width: `${pctEaten}%` }}
                />
              </div>
              <p className="text-[0.72rem] text-white/60">{pctEaten}% of goal logged so far</p>
            </div>
          </div>
        </motion.section>

        {/* ---- macro split ---- */}
        <section className="relative overflow-hidden rounded-[1.75rem] border border-white/20 bg-white/8 p-5 shadow-[0_8px_28px_rgba(0,0,0,0.3)] backdrop-blur-xl">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 45%)",
            }}
          />
          <h2 className="relative font-serif text-lg text-white">Today's macros</h2>
          <div className="relative mt-4 flex flex-col gap-3.5">
            {macros.map((macro) => {
              const Icon = MACRO_ICON[macro.key];
              const pct = Math.min(100, (macro.grams / longestBar) * 100);
              const overGoal = macro.grams > macro.goalGrams;
              return (
                <div key={macro.key} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10">
                    <Icon className="h-4 w-4 text-white/80" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[0.83rem] text-white/85">{macro.label}</span>
                      <span className="text-[0.78rem] tabular-nums text-white/60">
                        {macro.grams}
                        <span className="text-white/40"> / {macro.goalGrams}g</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/12">
                      <div
                        className={`h-full rounded-full ${
                          overGoal
                            ? "bg-gradient-to-r from-[#f4d0a3] to-[#e6a37a]"
                            : "bg-gradient-to-r from-[#9fe6cf] to-[#7dc9c2]"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---- 7-day streak ---- */}
        <section className="relative overflow-hidden rounded-[1.75rem] border border-white/20 bg-white/8 p-5 shadow-[0_8px_28px_rgba(0,0,0,0.3)] backdrop-blur-xl">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 45%)",
            }}
          />
          <div className="relative flex items-baseline justify-between">
            <h2 className="font-serif text-lg text-white">Logging streak</h2>
            <p className="text-[0.8rem] text-white/70">
              <span className="font-medium text-white">{streak.currentDays}</span> days running
            </p>
          </div>
          <div className="relative mt-4 flex justify-between gap-1.5">
            {streak.days.map((day) => {
              const dayPct = day.logged ? Math.min(100, (day.calories / day.goal) * 100) : 0;
              const isToday = day.date === "Aug 10";
              return (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className={`relative h-16 w-full overflow-hidden rounded-full border ${
                      day.logged ? "border-white/25 bg-white/10" : "border-white/10 bg-white/5"
                    } ${isToday ? "ring-1 ring-white/50" : ""}`}
                  >
                    <div
                      className={`absolute bottom-0 left-0 w-full rounded-full ${
                        day.logged
                          ? "bg-gradient-to-t from-[#9fe6cf] to-[#c9e6a3]"
                          : "bg-transparent"
                      }`}
                      style={{ height: `${dayPct}%` }}
                    />
                    {!day.logged && (
                      <div className="absolute inset-0 flex items-center justify-center text-white/30">
                        <span className="text-[0.6rem]">—</span>
                      </div>
                    )}
                  </div>
                  <span
                    className={`text-[0.68rem] ${
                      isToday ? "font-medium text-white" : "text-white/55"
                    }`}
                  >
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---- nutrients to watch ---- */}
        <section className="relative overflow-hidden rounded-[1.75rem] border border-white/20 bg-white/8 p-5 shadow-[0_8px_28px_rgba(0,0,0,0.3)] backdrop-blur-xl">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 45%)",
            }}
          />
          <h2 className="relative font-serif text-lg text-white">Nutrients to watch</h2>
          <ul className="relative mt-3.5 flex flex-col gap-2.5">
            {data.nrv
              .filter((item) => item.direction !== "on-target")
              .slice(0, 3)
              .map((item) => (
                <li key={item.nutrient} className="flex items-center justify-between text-sm">
                  <span className="text-white/80">{item.nutrient}</span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[0.72rem] ${
                      item.direction === "less"
                        ? "border-[#e6a37a]/40 bg-[#e6a37a]/15 text-[#f4d0a3]"
                        : "border-[#9fe6cf]/40 bg-[#9fe6cf]/15 text-[#c9f0e2]"
                    }`}
                  >
                    {item.pctOfNrv}% NRV · {item.direction === "less" ? "ease off" : "add more"}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
