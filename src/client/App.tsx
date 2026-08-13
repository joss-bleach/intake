import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell, GlassPanel } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { OnboardingFlow } from "@/screens/onboarding/onboarding-flow";
import { DashboardScreen } from "@/screens/dashboard/dashboard-screen";
import { ProfileScreen } from "@/screens/profile/profile-screen";
import { LogDescriptionScreen } from "@/screens/log-description/log-description-screen";
import { LogLabelPhotoScreen } from "@/screens/log-label-photo/log-label-photo-screen";
import { theme } from "@/lib/theme";
import { trpc, queryClient } from "@/lib/trpc";

type Route =
  | "dashboard"
  | "profile"
  | "log-choice"
  | "log-description"
  | "log-label-photo";

// Top-level screen switch, driven by whether a goal has been set (#45):
// no `user_goals` row means onboarding hasn't run yet, so that's shown
// instead of the dashboard until it completes. No router library — the app
// only has these few destinations so far; #53 can graduate this once
// there's enough surface to need one.
function App() {
  const goalsQuery = useQuery(trpc.goals.get.queryOptions());
  const [route, setRoute] = useState<Route>("dashboard");
  // Set only by the label-photo path's incomplete-read handoff (issue #51),
  // and cleared whenever the description screen is entered any other way —
  // otherwise a stale extraction would resurface on the next unrelated
  // visit to "Describe a meal".
  const [handoffText, setHandoffText] = useState<string | null>(null);

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

  // Both logging paths (#46, #47) are now behind the "+" button, so it has
  // to ask which one. A plain two-button panel, not the final design —
  // the real dashboard (#53) owns how logging is entered.
  if (route === "log-choice") {
    return (
      <AppShell activeTab="log">
        <h1
          className="font-display text-[1.6rem] leading-[1.05] tracking-[-0.02em]"
          style={{ color: theme.text.heading }}
        >
          Log food
        </h1>

        <GlassPanel className="mt-7 flex flex-col gap-3">
          <Button
            onClick={() => {
              setHandoffText(null);
              setRoute("log-description");
            }}
          >
            Describe a meal
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setHandoffText(null);
              setRoute("log-label-photo");
            }}
          >
            Scan a label
          </Button>
          <Button variant="outline" onClick={() => setRoute("dashboard")}>
            Cancel
          </Button>
        </GlassPanel>
      </AppShell>
    );
  }

  if (route === "log-description") {
    return (
      <LogDescriptionScreen
        onSaved={() => setRoute("dashboard")}
        initialText={handoffText ?? undefined}
      />
    );
  }

  if (route === "log-label-photo") {
    return (
      <LogLabelPhotoScreen
        onDiscard={() => setRoute("dashboard")}
        onSaved={() => setRoute("dashboard")}
        onIncompleteRead={(text) => {
          setHandoffText(text);
          setRoute("log-description");
        }}
      />
    );
  }

  return (
    <DashboardScreen
      goals={goalsQuery.data}
      onOpenProfile={() => setRoute("profile")}
      onLogFood={() => setRoute("log-choice")}
    />
  );
}

export default App;
