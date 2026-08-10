import { motion } from "motion/react";
import {
  Beef,
  BookOpen,
  Droplet,
  Home,
  LineChart,
  Leaf,
  Plus,
  User,
  Wheat,
} from "lucide-react";

// Shared C6-B1 chrome, extracted from prototypes/dashboard-look (origin/prototype/dashboard-look,
// src/variants/c6-base.tsx + VariantC6B1.tsx) so this prototype reuses the accepted look wholesale
// instead of relitigating it. Trimmed to the pieces this screen actually needs (no food-log block
// treatments — this screen has different content).

// Macro bar/chip colours are locked (rose/amber/violet/emerald family) across every C6 colour
// variant per explicit instruction — only the backdrop + hero bar move.
export const MACRO_STYLE: Record<
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

export type C6Texture = "none" | "grain" | "glass" | "mesh";

export interface C6TextPalette {
  heading: string;
  emphasisStrong: string;
  label: string;
  body: string;
  suffixLight: string;
  foodName: string;
  muted: string;
  mutedLabel: string;
  faint: string;
}

export const DEFAULT_TEXT: C6TextPalette = {
  heading: "#2f2a42",
  emphasisStrong: "#4a4360",
  label: "#544d68",
  body: "#453f5c",
  suffixLight: "#847c99",
  foodName: "#3d3555",
  muted: "#726a89",
  mutedLabel: "#5f5876",
  faint: "#948ba9",
};

export interface C6Theme {
  /** Page backdrop wash behind the blobs, e.g. "bg-[#f6f2fb]". */
  pageBg: string;
  /** 3 base blobs: position/size classes stay fixed, only fill colour changes. */
  blobs: [string, string, string];
  /** Extra blob(s) for the "mesh" texture. Unused by C6-B1 but kept for parity. */
  meshBlobs?: string[];
  /** Hero progress bar, linear left-to-right. */
  barGradient: string;
  /** Nav active-icon colour + log button fill, matched to the theme's accent. */
  navActiveClass: string;
  navButtonGradient: string;
  texture: C6Texture;
  /** Overrides for the default violet-grey text palette — e.g. an indigo-950 tint. */
  text?: Partial<C6TextPalette>;
}

// PROTOTYPE — subtle SVG film-grain, tuned to sit on the backdrop only.
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

export function useC6Chrome(theme: C6Theme) {
  const t: C6TextPalette = { ...DEFAULT_TEXT, ...theme.text };
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

  return { t, panelClass, tileClass, sheenClass, showGrain };
}

/** The animated gradient-blob backdrop, identical recipe to c6-base's. */
export function C6Backdrop({ theme, showGrain }: { theme: C6Theme; showGrain: boolean }) {
  return (
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
  );
}

export function NavIcon({
  icon: Icon,
  label,
  active = false,
  activeClass = "text-violet-600",
}: {
  icon: typeof Home;
  label: string;
  active?: boolean;
  activeClass?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${
        active ? activeClass : "text-[#726a89] hover:text-[#4a4360]"
      }`}
    >
      <Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.4 : 2} />
    </button>
  );
}

/** Fixed bottom nav — same edge-to-edge glass bar as the dashboard, with the
 * active tab passed in (Insights is active on this screen, unlike the dashboard). */
export function BottomNav({
  theme,
  active,
}: {
  theme: C6Theme;
  active: "home" | "insights" | "log" | "profile";
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-white/60 bg-white/80 backdrop-blur-2xl">
      <div className="relative mx-auto flex max-w-[420px] items-center justify-between px-8 pb-[max(1.125rem,env(safe-area-inset-bottom))] pt-4">
        <div className="flex items-center gap-8">
          <NavIcon icon={Home} label="Home" active={active === "home"} activeClass={theme.navActiveClass} />
          <NavIcon
            icon={LineChart}
            label="Insights"
            active={active === "insights"}
            activeClass={theme.navActiveClass}
          />
        </div>
        <div className="flex items-center gap-8">
          <NavIcon icon={BookOpen} label="Log" active={active === "log"} activeClass={theme.navActiveClass} />
          <NavIcon icon={User} label="Profile" active={active === "profile"} activeClass={theme.navActiveClass} />
        </div>
        <button
          type="button"
          aria-label="Log food"
          className={`absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-br ${theme.navButtonGradient} text-white ring-4 ring-white/80 transition-transform active:scale-95`}
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </button>
      </div>
    </nav>
  );
}
