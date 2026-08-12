import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AppShell, GlassPanel } from "@/components/shell";
import { theme } from "@/lib/theme";
import { trpc } from "@/lib/trpc";

// Blank placeholder route — the app shell with nothing but a server-connectivity
// check dropped in, standing in for a real screen (dashboard, log flow, …)
// until #46/#47/#53 land. Visual system baseline only: blobs, glass, font,
// nav — see #42.
function App() {
  const ping = useQuery(trpc.ping.queryOptions());

  return (
    <AppShell>
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
      </GlassPanel>
    </AppShell>
  );
}

export default App;
