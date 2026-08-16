import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../src/server/db";
import { migrate } from "../../src/server/db/migrate";
import { handleApiRequest } from "../../src/server/app";

// Exercises the shared fetch handler both worker.ts and dev-server.ts sit
// on top of — the routing split (/api/auth/* vs tRPC) and the tRPC
// endpoint prefix, matching what the client and Vite's dev proxy send.
describe("handleApiRequest", () => {
  beforeAll(async () => {
    await migrate();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("routes /trpc/* to the tRPC router, at the /trpc prefix", async () => {
    const response = await handleApiRequest(new Request("http://localhost/trpc/ping"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result.data.message).toBe("pong");
  });

  it("routes /api/auth/* to betterauth", async () => {
    const response = await handleApiRequest(new Request("http://localhost/api/auth/get-session"));
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });
});
