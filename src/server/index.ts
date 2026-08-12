import { createHTTPServer } from "@trpc/server/adapters/standalone";
import cors from "cors";
import { appRouter } from "./router";
import { createContext } from "./context";

const port = Number(process.env.PORT ?? 3001);

const server = createHTTPServer({
  router: appRouter,
  createContext,
  middleware: cors(),
});

server.listen(port);

console.log(`tRPC server listening on http://localhost:${port}`);
