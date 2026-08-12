import { BookOpen, Home, LineChart, Plus, User, type LucideIcon } from "lucide-react";
import { theme } from "@/lib/theme";

export type BottomNavActiveTab = "home" | "insights" | "log" | "profile";

// Fixed bottom nav — a plain edge-to-edge glass bar (not a floating pill),
// with a distinct raised, themed log button centered via absolute
// positioning (not flex distribution, so it stays dead-center regardless of
// icon widths). Ported verbatim from c6-base.tsx (prototype/dashboard-look).
export function BottomNav({
  active,
  onLogFood,
}: {
  active?: BottomNavActiveTab;
  onLogFood?: () => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-white/60 bg-white/80 backdrop-blur-2xl">
      <div className="relative mx-auto flex max-w-[420px] items-center justify-between px-8 pb-[max(1.125rem,env(safe-area-inset-bottom))] pt-4">
        <div className="flex items-center gap-8">
          <NavIcon icon={Home} label="Home" active={active === "home"} />
          <NavIcon icon={LineChart} label="Insights" active={active === "insights"} />
        </div>
        <div className="flex items-center gap-8">
          <NavIcon icon={BookOpen} label="Log" active={active === "log"} />
          <NavIcon icon={User} label="Profile" active={active === "profile"} />
        </div>
        <button
          type="button"
          aria-label="Log food"
          onClick={onLogFood}
          className={`absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-br ${theme.navButtonGradient} text-white ring-4 ring-white/80 transition-transform active:scale-95`}
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </button>
      </div>
    </nav>
  );
}

function NavIcon({
  icon: Icon,
  label,
  active = false,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${
        active ? theme.navActiveClass : theme.navInactiveClass
      }`}
    >
      <Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.4 : 2} />
    </button>
  );
}
