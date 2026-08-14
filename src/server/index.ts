import http from "node:http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import { auth } from "./auth";
import { createContext } from "./context";
import { env } from "./env";
import { appRouter } from "./router";

// createHTTPServer owns the whole server, so betterauth's own handler (which
// needs its own path, /api/auth/*) can't sit alongside it. Drop to the
// handler-level primitive and route by path on one plain http.Server instead.
const corsMiddleware = cors({ origin: env.CLIENT_ORIGIN, credentials: true });
const trpcHandler = createHTTPHandler({ router: appRouter, createContext });
const authHandler = toNodeHandler(auth);

const server = http.createServer((req, res) => {
  corsMiddleware(req, res, () => {
    if (req.url?.startsWith("/api/auth/")) {
      authHandler(req, res);
      return;
    }
    trpcHandler(req, res);
  });
});

server.listen(env.PORT);

console.log(`tRPC server listening on http://localhost:${env.PORT}`);
