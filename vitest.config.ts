import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Integration tests share one real Postgres instance (DATABASE_URL) and
    // some of them (food ingestion/resolution, issue #44) clear whole tables
    // between cases rather than tracking individual row IDs — running test
    // *files* in parallel would let two files race on the same tables. Unit
    // tests pay a small, acceptable cost for this; the suite is small enough
    // that sequential files aren't a real time hit.
    fileParallelism: false,
  },
});
