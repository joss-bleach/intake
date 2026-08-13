import type { ReactNode } from "react";
import { Blobs } from "./blobs";
import { BottomNav, type BottomNavActiveTab } from "./bottom-nav";
import { theme } from "@/lib/theme";

// The empty themed app shell: pastel-gradient-blob backdrop + fixed bottom
// nav, C6-B1 colourway. Any screen (dashboard, description-log,
// label-photo-log, …) drops its content into `children`; the shell owns
// nothing about what's logged, only how the app frames it.
export function AppShell({
  children,
  activeTab = "home",
  onLogFood,
  onProfile,
  onInsights,
  showNav = true,
}: {
  children?: ReactNode;
  activeTab?: BottomNavActiveTab;
  onLogFood?: () => void;
  onProfile?: () => void;
  onInsights?: () => void;
  showNav?: boolean;
}) {
  return (
    <div
      className={`relative isolate min-h-screen overflow-hidden ${theme.pageBg} ${showNav ? "pb-24" : ""}`}
    >
      <Blobs />
      <div className="relative flex min-h-screen flex-col px-5 pb-12 pt-14">
        {children}
      </div>
      {showNav && (
        <BottomNav active={activeTab} onLogFood={onLogFood} onProfile={onProfile} onInsights={onInsights} />
      )}
    </div>
  );
}
