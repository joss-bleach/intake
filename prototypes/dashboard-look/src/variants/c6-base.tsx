import { motion } from "motion/react";
import {
  Beef,
  BookOpen,
  CircleDashed,
  Droplet,
  Flame,
  Home,
  LineChart,
  Leaf,
  Plus,
  User,
  Wheat,
} from "lucide-react";
import type { dashboardData } from "../data";

// Macro bar/chip colours are locked (red/yellow/green-ish family) across every
// C6 colour variant per explicit instruction — only the backdrop + hero bar move.
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

const RECENT_FOODS = [
  { name: "Greek yogurt", detail: "150 kcal" },
  { name: "Chicken & rice", detail: "480 kcal" },
  { name: "Protein shake", detail: "210 kcal" },
  { name: "Almond butter toast", detail: "290 kcal" },
];

export type C6Texture = "none" | "grain" | "glass" | "mesh";

export interface C6Theme {
  /** Page backdrop wash behind the blobs, e.g. "bg-[#f6f2fb]". */
  pageBg: string;
  /** 3 base blobs: position/size classes stay fixed, only fill colour changes. */
  blobs: [string, string, string];
  /** Extra blob(s) for the "mesh" texture — pushes 1 solid gradient into 3-4 distinct blobs. */
  meshBlobs?: string[];
  /** Hero calorie progress bar, linear left-to-right. */
  barGradient: string;
  texture: C6Texture;
}

// PROTOTYPE — subtle SVG film-grain, tuned to sit on the backdrop only (it's
// painted inside the -z-10 blob layer, behind every glass card).
function GrainOverlay({ opacity = "opacity-[0.06]" }: { opacity?: string }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 mix-blend-overlay ${opacity}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      }}
      aria-hidden="true"
    />
  );
}

export function VariantC6Base({
  data,
  theme,
}: {
  data: typeof dashboardData;
  theme: C6Theme;
}) {
  const { today, streak, macros } = data;
  const eatenPct = Math.min(100, Math.round((today.calories / today.goal) * 100));
  const maxDayCalories = Math.max(...streak.days.map((d) => Math.max(d.calories, d.goal)));
  const todayLabel = streak.days[streak.days.length - 1]?.label;

  const orderedMacros = [...macros].sort((a, b) =>
    a.key === "protein" ? -1 : b.key === "protein" ? 1 : 0,
  );

  // Texture B (frosted glass cards) turns up the glass treatment on every panel;
  // every other texture (or no texture) keeps the standard C6 glass recipe.
  const isGlass = theme.texture === "glass";
  const panelClass = isGlass
    ? "relative overflow-hidden rounded-[2rem] bg-white/60 p-6 ring-1 ring-inset ring-white/85 backdrop-blur-2xl"
    : "relative overflow-hidden rounded-[2rem] bg-white/35 p-6 ring-1 ring-inset ring-white/70 backdrop-blur-2xl";
  const tileClass = isGlass
    ? "relative overflow-hidden rounded-[1.5rem] bg-white/60 p-4 ring-1 ring-inset ring-white/85 backdrop-blur-2xl"
    : "relative overflow-hidden rounded-[1.5rem] bg-white/35 p-4 ring-1 ring-inset ring-white/70 backdrop-blur-2xl";
  const sheenClass = isGlass
    ? "pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-white/60 via-white/10 to-transparent"
    : "pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-white/50 via-white/5 to-transparent";

  const showGrain = theme.texture === "grain" || theme.texture === "mesh";

  return (
    <div className={`relative isolate min-h-full overflow-hidden ${theme.pageBg} pb-24`}>
      {/* Gradient-blob backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          className={`absolute -left-24 -top-16 h-72 w-72 rounded-full ${theme.blobs[0]} blur-3xl`}
          animate={{ x: [0, 18, 0], y: [0, 14, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className={`absolute -right-28 top-40 h-80 w-80 rounded-full ${theme.blobs[1]} blur-3xl`}
          animate={{ x: [0, -16, 0], y: [0, 20, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className={`absolute bottom-0 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full ${theme.blobs[2]} blur-3xl`}
          animate={{ x: [0, 14, 0], y: [0, -12, 0], scale: [1, 1.06, 1] }}
          transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
        />
        {theme.meshBlobs?.map((blob, i) => (
          <motion.div
            key={i}
            className={`absolute ${blob} blur-3xl`}
            animate={{ x: [0, i % 2 === 0 ? 12 : -12, 0], y: [0, i % 2 === 0 ? -10 : 10, 0], scale: [1, 1.07, 1] }}
            transition={{ duration: 28 + i * 4, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-white/40" />
        {showGrain && <GrainOverlay />}
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
          <div className="mb-1 flex items-center gap-1.5 rounded-full bg-white/35 px-3 py-1.5 ring-1 ring-inset ring-white/70 backdrop-blur-xl">
            <Flame className="h-4 w-4 text-orange-400" strokeWidth={2.25} />
            <span className="text-sm font-semibold text-[#4a4360]">{streak.currentDays}-day</span>
          </div>
        </div>

        {/* Hero panel: calories remaining is the headline */}
        <div className={panelClass}>
          <div className={sheenClass} aria-hidden="true" />
          <p className="text-sm text-[#544d68]">Left to eat today</p>
          <p className="mt-1 font-display text-6xl leading-none tracking-[-0.02em] text-[#2f2a42]">
            {today.caloriesRemaining.toLocaleString()}
          </p>
          <p className="mt-1.5 text-sm font-medium text-[#4a4360]">kcal left today</p>

          <div className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-[#ece7f6]">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${theme.barGradient}`}
              style={{ width: `${eatenPct}%` }}
            />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[#453f5c]">
            <span className="font-semibold text-[#4a4360]">
              {today.calories.toLocaleString()}
            </span>{" "}
            of {today.goal.toLocaleString()} kcal logged so far.
          </p>
        </div>

        {/* Macros — bento grid, four equal tiles, protein still listed first */}
        <div className="grid grid-cols-2 gap-3">
          {orderedMacros.map((macro) => {
            const style = MACRO_STYLE[macro.key];
            const Icon = style.icon;
            const pct = Math.min(100, Math.round((macro.grams / macro.goalGrams) * 100));
            return (
              <div key={macro.key} className={tileClass}>
                <div className={sheenClass} aria-hidden="true" />
                <span className={`flex h-8 w-8 items-center justify-center rounded-full ${style.chip}`}>
                  <Icon className="h-4 w-4" strokeWidth={2.25} />
                </span>
                <p className="mt-3 text-sm font-medium text-[#4a4360]">{macro.label}</p>
                <p className="mt-0.5 font-display text-xl tracking-[-0.01em] text-[#2f2a42]">
                  {macro.grams}
                  <span className="ml-0.5 font-sans text-xs font-normal text-[#847c99]">
                    /{macro.goalGrams}g
                  </span>
                </p>
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[#ece7f6]">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${style.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Recently logged — tap to re-log */}
        <div className={panelClass}>
          <div className={sheenClass} aria-hidden="true" />
          <h2 className="text-base font-semibold text-[#2f2a42]">Recently logged</h2>
          <div className="mt-4 flex flex-col gap-2.5">
            {RECENT_FOODS.map((food) => (
              <div
                key={food.name}
                className={`relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl px-4 py-3 ring-1 ring-inset backdrop-blur-md ${
                  isGlass ? "bg-white/65 ring-white/75" : "bg-white/40 ring-white/60"
                }`}
              >
                <div
                  className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-white/40 via-white/5 to-transparent"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#3d3555]">{food.name}</p>
                  <p className="text-xs text-[#726a89]">{food.detail}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Add ${food.name}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white transition-transform active:scale-95"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 7-day streak */}
        <div className={panelClass}>
          <div className={sheenClass} aria-hidden="true" />
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#2f2a42]">This week</h2>
            <span className="text-sm text-[#5f5876]">
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
                            ? "from-violet-500 to-fuchsia-400"
                            : "from-violet-200 to-violet-300"
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-[#d8d2e6]">
                        <CircleDashed className="h-4 w-4 text-[#948ba9]" strokeWidth={2} />
                      </div>
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      isToday ? "text-[#3d3555]" : "text-[#726a89]"
                    }`}
                  >
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Fixed bottom nav — a plain edge-to-edge glass bar, not a floating pill,
          with a distinct raised log button centered via absolute positioning
          (not flex distribution, so it stays dead-center regardless of icon widths). */}
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-white/60 bg-white/80 backdrop-blur-2xl">
        <div className="relative mx-auto flex max-w-[420px] items-center justify-between px-8 pb-[max(1.125rem,env(safe-area-inset-bottom))] pt-4">
          <div className="flex items-center gap-8">
            <NavIcon icon={Home} label="Home" active />
            <NavIcon icon={LineChart} label="Insights" />
          </div>
          <div className="flex items-center gap-8">
            <NavIcon icon={BookOpen} label="Log" />
            <NavIcon icon={User} label="Profile" />
          </div>
          <button
            type="button"
            aria-label="Log food"
            className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white ring-4 ring-white/80 transition-transform active:scale-95"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </button>
        </div>
      </nav>
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
        active ? "text-violet-600" : "text-[#726a89] hover:text-[#4a4360]"
      }`}
    >
      <Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.4 : 2} />
    </button>
  );
}
