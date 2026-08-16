import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { auth } from "./auth";
import { createContext } from "./context";
import { appRouter } from "./router";

// Applied to every API response. The Worker only ever serves JSON here —
// static assets and the document are served by Cloudflare's asset handler
// ahead of this code (see alchemy.run.ts's run_worker_first), so the
// document's own CSP lives in index.html's <meta>, not here.
//
// - nosniff: an API response must never be re-interpreted as HTML/JS.
// - default-src 'none': belt and braces for the same thing — if a response
//   ever were rendered as a document, it can load nothing.
// - Referrer-Policy: keeps paths off cross-origin requests.
// - HSTS is host-wide once the browser sees it on any response, so setting
//   it here covers the document too, which index.html's <meta> cannot do.
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
} satisfies Record<string, string>;

// Rebuilt rather than mutated: a Response's headers are immutable once it
// has been constructed by betterauth or the tRPC adapter.
const withSecurityHeaders = (response: Response): Response => {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

// Shared by every entrypoint: betterauth owns /api/auth/*, tRPC owns the
// rest. No CORS here — prod is same-origin; dev-only CORS lives in
// dev-server.ts so it never reaches the Worker bundle.
export const handleApiRequest = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/auth/")) {
    return withSecurityHeaders(await auth.handler(request));
  }

  return withSecurityHeaders(
    await fetchRequestHandler({
      endpoint: "/trpc",
      req: request,
      router: appRouter,
      createContext,
    }),
  );
};
