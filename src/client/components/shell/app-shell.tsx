import type { ReactNode } from "react";
import { Blobs } from "./blobs";
import { BottomNav, type BottomNavActiveTab } from "./bottom-nav";
import { theme } from "@/lib/theme";
import { useOnlineStatus } from "@/lib/offline";

// The empty themed app shell: pastel-gradient-blob backdrop + fixed bottom
// nav, C6-B1 colourway. Any screen (dashboard, description-log,
// label-photo-log, …) drops its content into `children`; the shell owns
// nothing about what's logged, only how the app frames it.
export function AppShell({
  children,
  activeTab = "home",
  onLogFood,
  onProfile,
  showNav = true,
}: {
  children?: ReactNode;
  activeTab?: BottomNavActiveTab;
  onLogFood?: () => void;
  onProfile?: () => void;
  showNav?: boolean;
}) {
  const online = useOnlineStatus();

  return (
    <div
      className={`relative isolate min-h-screen overflow-hidden ${theme.pageBg} ${showNav ? "pb-24" : ""}`}
    >
      <Blobs />
      {/* Plain "offline" indicator (ADR 0003) — no extra copy about cached data. */}
      {!online && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-3">
          <span className="rounded-full bg-black/80 px-3 py-1 text-xs font-medium text-white backdrop-blur-xl">
            offline
          </span>
        </div>
      )}
      <div className="relative flex min-h-screen flex-col px-5 pb-12 pt-14">
        {children}
      </div>
      {showNav && (
        <BottomNav active={activeTab} onLogFood={onLogFood} onProfile={onProfile} />
      )}
    </div>
  );
}
