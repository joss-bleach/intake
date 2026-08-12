import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { QueryClient } from "@tanstack/react-query";
import type { AppRouter } from "../../server/router";

export const queryClient = new QueryClient();

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
