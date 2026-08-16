import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { auth } from "./auth";
import { createContext } from "./context";
import { appRouter } from "./router";

// Shared by every entrypoint: betterauth owns /api/auth/*, tRPC owns the
// rest. No CORS here — prod is same-origin; dev-only CORS lives in
// dev-server.ts so it never reaches the Worker bundle.
export const handleApiRequest = (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/auth/")) {
    return auth.handler(request);
  }

  return fetchRequestHandler({
    endpoint: "/trpc",
    req: request,
    router: appRouter,
    createContext,
  });
};
