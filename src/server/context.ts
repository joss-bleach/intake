import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { auth } from "./auth";
import { db } from "./db";

// Built once per request. `session`/`user` are null when signed out — callers
// (e.g. protectedProcedure in trpc.ts) narrow that themselves.
export const createContext = async ({ req }: FetchCreateContextFnOptions) => {
  // A transient failure here (e.g. a DB blip) must not take down public
  // procedures too — treat it as signed-out; protectedProcedure still
  // denies, it just can't tell "no session" from "couldn't check". `req` is
  // a Web Request here, so `req.headers` needs no Node adapter conversion.
  const result = await auth.api.getSession({ headers: req.headers }).catch(() => null);

  return { db, session: result?.session ?? null, user: result?.user ?? null };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
