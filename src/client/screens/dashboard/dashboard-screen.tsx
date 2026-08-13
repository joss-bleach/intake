import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AppShell, GlassPanel } from "@/components/shell";
import { theme } from "@/lib/theme";
import { trpc } from "@/lib/trpc";
import type { GoalsSnapshot } from "@/lib/router-types";

// Blank placeholder route — the app shell with nothing but a server-connectivity
// check dropped in, standing in for a real screen until #53 lands. Visual
// system baseline only: blobs, glass, font, nav — see #42. Reached once
// onboarding (#45) has written a goal; the goal itself is surfaced here so
// there's visible proof onboarding actually took, not just a swapped route.
export function DashboardScreen({
  goals,
  onOpenProfile,
  onLogFood,
}: {
  goals: GoalsSnapshot;
  onOpenProfile: () => void;
  onLogFood?: () => void;
}) {
  const ping = useQuery(trpc.ping.queryOptions());

  return (
    <AppShell activeTab="home" onProfile={onOpenProfile} onLogFood={onLogFood}>
      <h1
        className="font-display text-[2rem] leading-[1.05] tracking-[-0.02em]"
        style={{ color: theme.text.heading }}
      >
        Intake
      </h1>

      <GlassPanel className="mt-7 flex flex-col items-start gap-4">
        <p className="text-sm" style={{ color: theme.text.label }}>
          Placeholder route — screens drop in here.
        </p>

        {goals && (
          <p className="text-sm" style={{ color: theme.text.body }}>
            Goal: {goals.calorieGoal} kcal · {goals.macros.proteinGrams}P /{" "}
            {goals.macros.carbsGrams}C / {goals.macros.fatGrams}F
          </p>
        )}

        <Button onClick={() => ping.refetch()} disabled={ping.isFetching}>
          {ping.isFetching ? "Pinging…" : "Ping the server"}
        </Button>

        {ping.data && (
          <p className="text-sm" style={{ color: theme.text.muted }} data-testid="ping-result">
            {ping.data.message} @ {ping.data.timestamp}
          </p>
        )}

        {ping.isError && (
          <p className="text-sm text-red-500">Ping failed: {ping.error.message}</p>
        )}

        <Button variant="outline" onClick={onOpenProfile}>
          Edit goals
        </Button>
      </GlassPanel>
    </AppShell>
  );
}
