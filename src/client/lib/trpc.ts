import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { persistQueryClient } from "@tanstack/query-persist-client-core";
import { get, set, del } from "idb-keyval";
import type { AppRouter } from "../../server/router";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// gcTime must be at least as long as the persister's maxAge below — otherwise
// TanStack Query garbage-collects an inactive query from memory (default 5
// min) well before 24h, which rewrites it out of the persisted snapshot too.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { gcTime: TWENTY_FOUR_HOURS_MS } },
});

// idb-keyval's get/set/del adapted to the getItem/setItem/removeItem shape
// createAsyncStoragePersister expects.
const idbStorage = {
  getItem: async (key: string) => (await get(key)) ?? null,
  setItem: (key: string, value: string) => set(key, value),
  removeItem: (key: string) => del(key),
};

// Persists the query cache to IndexedDB so "recently viewed" reads survive
// a reload while offline (ADR 0003), reusing TanStack Query's own
// cache/staleness model instead of a second HTTP-level cache. Mutations
// are excluded — this is a read cache only, no queue/retry for writes.
persistQueryClient({
  queryClient,
  persister: createAsyncStoragePersister({ storage: idbStorage, key: "intake-query-cache" }),
  maxAge: TWENTY_FOUR_HOURS_MS,
  dehydrateOptions: {
    shouldDehydrateMutation: () => false,
  },
});

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      // Proxied by Vite's dev server (see vite.config.ts) to the standalone
      // tRPC server, so client and server share an origin in dev.
      url: "/trpc",
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
