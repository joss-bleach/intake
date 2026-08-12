import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import { pool } from "./db";

// Built once per request. Later tickets grow this with the authenticated
// user, request-scoped Effect services, etc. — kept minimal here since this
// ticket is only responsible for wiring the seam, not the real context.
export const createContext = (_opts: CreateHTTPContextOptions) => {
  return { db: pool };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
