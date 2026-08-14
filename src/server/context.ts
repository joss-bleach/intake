import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth";
import { db } from "./db";

// Built once per request. `session`/`user` are null when signed out — callers
// (e.g. protectedProcedure in trpc.ts) narrow that themselves.
export const createContext = async ({ req }: CreateHTTPContextOptions) => {
  // A transient failure here (e.g. a DB blip during the session lookup)
  // must not take down public procedures too — treat it as signed-out;
  // protectedProcedure still denies, it just can't tell "no session" from
  // "couldn't check".
  const result = await auth.api
    .getSession({ headers: fromNodeHeaders(req.headers) })
    .catch(() => null);

  return { db, session: result?.session ?? null, user: result?.user ?? null };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
