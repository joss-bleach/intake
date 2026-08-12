import { createHTTPServer } from "@trpc/server/adapters/standalone";
import cors from "cors";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./env";

const server = createHTTPServer({
  router: appRouter,
  createContext,
  middleware: cors(),
});

server.listen(env.PORT);

console.log(`tRPC server listening on http://localhost:${env.PORT}`);
