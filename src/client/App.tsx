import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell, GlassPanel } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { OnboardingFlow } from "@/screens/onboarding/onboarding-flow";
import { DashboardScreen } from "@/screens/dashboard/dashboard-screen";
import { ProfileScreen } from "@/screens/profile/profile-screen";
import { LogDescriptionScreen } from "@/screens/log-description/log-description-screen";
import { theme } from "@/lib/theme";
import { trpc, queryClient } from "@/lib/trpc";

type Route = "dashboard" | "profile" | "log-description";

// Top-level screen switch, driven by whether a goal has been set (#45):
// no `user_goals` row means onboarding hasn't run yet, so that's shown
// instead of the dashboard until it completes. No router library — the app
// only has these three destinations so far; #53 can graduate this once
// there's enough surface to need one.
function App() {
  const goalsQuery = useQuery(trpc.goals.get.queryOptions());
  const [route, setRoute] = useState<Route>("dashboard");

  if (goalsQuery.isPending) {
    return null;
  }

  // A failed fetch must not be read as "no goal set" — that would drop an
  // existing user with a saved goal back into onboarding on a transient
  // network/DB error, instead of surfacing the failure.
  if (goalsQuery.isError) {
    return (
      <AppShell showNav={false}>
        <GlassPanel className="mt-14 flex flex-col items-start gap-4">
          <p className="text-sm" style={{ color: theme.text.body }}>
            Couldn't load your goals: {goalsQuery.error.message}
          </p>
          <Button onClick={() => goalsQuery.refetch()}>Retry</Button>
        </GlassPanel>
      </AppShell>
    );
  }

  if (!goalsQuery.data) {
    return (
      <OnboardingFlow
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: trpc.goals.get.queryKey() });
        }}
      />
    );
  }

  if (route === "profile") {
    return (
      <ProfileScreen
        onBack={() => setRoute("dashboard")}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: trpc.goals.get.queryKey() });
          setRoute("dashboard");
        }}
      />
    );
  }

  if (route === "log-description") {
    return <LogDescriptionScreen onSaved={() => setRoute("dashboard")} />;
  }

  return (
    <DashboardScreen
      goals={goalsQuery.data}
      onOpenProfile={() => setRoute("profile")}
      onLogFood={() => setRoute("log-description")}
    />
  );
}

export default App;
