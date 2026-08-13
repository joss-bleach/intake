import { describe, expect, it } from "vitest";
import { computeStreak } from "../../../../src/server/dashboard/streak";

describe("computeStreak", () => {
  it("counts today and each unbroken prior day", () => {
    const dates = new Set(["2026-08-11", "2026-08-12", "2026-08-13"]);
    expect(computeStreak(dates, "2026-08-13")).toBe(3);
  });

  it("doesn't zero the streak just because today hasn't been logged yet", () => {
    const dates = new Set(["2026-08-11", "2026-08-12"]);
    expect(computeStreak(dates, "2026-08-13")).toBe(2);
  });

  it("stops at the first gap before today", () => {
    const dates = new Set(["2026-08-09", "2026-08-12", "2026-08-13"]);
    expect(computeStreak(dates, "2026-08-13")).toBe(2);
  });

  it("returns zero when neither today nor yesterday is logged", () => {
    const dates = new Set(["2026-08-01"]);
    expect(computeStreak(dates, "2026-08-13")).toBe(0);
  });

  it("returns zero for no logged dates at all", () => {
    expect(computeStreak(new Set(), "2026-08-13")).toBe(0);
  });
});
