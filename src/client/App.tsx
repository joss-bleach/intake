import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

function App() {
  const ping = useQuery(trpc.ping.queryOptions());

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Intake</h1>

      <Button onClick={() => ping.refetch()} disabled={ping.isFetching}>
        {ping.isFetching ? "Pinging…" : "Ping the server"}
      </Button>

      {ping.data && (
        <p className="text-sm text-neutral-500" data-testid="ping-result">
          {ping.data.message} @ {ping.data.timestamp}
        </p>
      )}

      {ping.isError && (
        <p className="text-sm text-red-500">
          Ping failed: {ping.error.message}
        </p>
      )}
    </main>
  );
}

export default App;
