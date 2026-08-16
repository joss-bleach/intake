import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { persistQueryClient } from "@tanstack/query-persist-client-core";
import { get, set, del } from "idb-keyval";
import type { AppRouter } from "../../server/router";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// gcTime must be at least as long as the persister's maxAge below — otherwise
// TanStack Query garbage-collects an inactive query from memory (default 5
// min) well before 24h, which rewrites it out of the persisted snapshot too.
// A session can end without the app being told — it expires, or it's revoked
// from another device. Until the next request fails there is nothing to react
// to, so the 24h persisted cache below would keep rendering the signed-out
// user's diary and profile from IndexedDB. The first 401 is that signal.
const isUnauthorized = (error: Error): boolean =>
  error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { gcTime: TWENTY_FOUR_HOURS_MS } },
  queryCache: new QueryCache({
    onError: (error) => {
      if (isUnauthorized(error)) void clearPersistedCache();
    },
  }),
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
const persister = createAsyncStoragePersister({
  storage: idbStorage,
  key: "intake-query-cache",
});

persistQueryClient({
  queryClient,
  persister,
  maxAge: TWENTY_FOUR_HOURS_MS,
  dehydrateOptions: {
    shouldDehydrateMutation: () => false,
  },
});

// Both halves are needed: clear() empties the in-memory cache (and so what's
// on screen), removeClient() deletes the IndexedDB snapshot a reload would
// otherwise restore from. Exported so signOut can reuse it.
export const clearPersistedCache = async (): Promise<void> => {
  queryClient.clear();
  await persister.removeClient();
};

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
