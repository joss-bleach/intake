import http from "node:http";
import cors from "cors";
import { handleApiRequest } from "./app";
import { env } from "./env";

// Local-only entrypoint: bridges node:http to the same fetch handler the
// Worker uses, and adds CORS for Vite's separate origin (:5173 vs :3001).
// Production is same-origin, so neither node:http nor cors ships in the
// Worker bundle — worker.ts never imports this file.
const corsMiddleware = cors({ origin: env.CLIENT_ORIGIN, credentials: true });

const toWebHeaders = (nodeHeaders: http.IncomingHttpHeaders): Headers => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v);
  }
  return headers;
};

const readBody = (req: http.IncomingMessage): Promise<Buffer | undefined> => {
  if (req.method === "GET" || req.method === "HEAD") return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
};

// Object.fromEntries(response.headers) would collapse repeated Set-Cookie
// headers to just the last one — betterauth can set more than one per
// response — so that header is sent via getSetCookie() instead.
const toNodeHeaders = (headers: Headers): http.OutgoingHttpHeaders => {
  const result: http.OutgoingHttpHeaders = Object.fromEntries(headers);
  const setCookie = headers.getSetCookie();
  if (setCookie.length > 0) result["set-cookie"] = setCookie;
  return result;
};

const server = http.createServer((req, res) => {
  corsMiddleware(req, res, () => {
    void (async () => {
      try {
        const body = await readBody(req);
        const request = new Request(`http://${req.headers.host}${req.url}`, {
          method: req.method,
          headers: toWebHeaders(req.headers),
          body: body ? new Uint8Array(body) : undefined,
        });

        const response = await handleApiRequest(request);
        res.writeHead(response.status, toNodeHeaders(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (error) {
        console.error(error);
        res.writeHead(500).end();
      }
    })();
  });
});

server.listen(env.PORT);

console.log(`tRPC server listening on http://localhost:${env.PORT}`);
