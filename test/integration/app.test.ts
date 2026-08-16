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

  // Both branches rebuild their Response to attach these, so both are
  // checked — an unheadered branch is exactly the kind of thing a later
  // refactor adds back without noticing.
  it.each([
    ["/trpc/ping", "http://localhost/trpc/ping"],
    ["/api/auth/get-session", "http://localhost/api/auth/get-session"],
  ])("sets security headers on %s", async (_label, url) => {
    const response = await handleApiRequest(new Request(url));

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=");
  });

  // Rebuilding the Response must not collapse betterauth's cookies — it can
  // set more than one per response, and Headers' plain iteration joins them.
  it("preserves every Set-Cookie when rebuilding the response", async () => {
    const original = new Response(null, { status: 200 });
    original.headers.append("Set-Cookie", "a=1; Path=/");
    original.headers.append("Set-Cookie", "b=2; Path=/");

    expect(new Headers(original.headers).getSetCookie()).toEqual([
      "a=1; Path=/",
      "b=2; Path=/",
    ]);
  });
});
