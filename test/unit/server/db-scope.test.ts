import { describe, expect, it } from "vitest";
import {
  createDb,
  db,
  pool,
  requireRequestScope,
  withDb,
} from "../../../src/server/db";

// No queries run here — pools are lazy until first checkout — so this
// exercises the issue #107 scoping mechanics without needing Postgres.
describe("request-scoped db (issue #107)", () => {
  it("resolves db/pool to the withDb handle, not the singleton", () => {
    const handle = createDb("postgres://scoped:scoped@localhost:5432/scoped");

    const seen = withDb(handle, () => ({
      // options carries the connection string the pool was built with
      connectionString: pool.options.connectionString,
      transactionIsFunction: db.transaction instanceof Function,
    }));

    expect(seen.connectionString).toBe(
      "postgres://scoped:scoped@localhost:5432/scoped",
    );
    expect(seen.transactionIsFunction).toBe(true);
  });

  it("keeps nested scopes independent", () => {
    const outer = createDb("postgres://outer:outer@localhost:5432/outer");
    const inner = createDb("postgres://inner:inner@localhost:5432/inner");

    withDb(outer, () => {
      withDb(inner, () => {
        expect(pool.options.connectionString).toContain("inner");
      });
      expect(pool.options.connectionString).toContain("outer");
    });
  });

  it("hard-fails outside withDb once requireRequestScope is set", () => {
    // Set for the whole process from here on — matching the Worker, where
    // the singleton fallback must never engage. Scoped access still works.
    requireRequestScope();

    expect(() => db.execute).toThrowError(/outside withDb/);
    expect(() => pool.query).toThrowError(/outside withDb/);

    const handle = createDb("postgres://ok:ok@localhost:5432/ok");
    expect(withDb(handle, () => db.execute instanceof Function)).toBe(true);
  });
});
