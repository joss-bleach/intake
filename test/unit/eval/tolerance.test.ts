import { describe, expect, it } from "vitest";
import { sameIdentity, withinTolerance } from "../../../src/eval/tolerance";

describe("withinTolerance", () => {
  it("passes a value inside the ratio", () => {
    expect(withinTolerance(102, 100, 0.02)).toBe(true);
    expect(withinTolerance(98, 100, 0.02)).toBe(true);
  });

  it("fails a value outside the ratio", () => {
    expect(withinTolerance(103, 100, 0.02)).toBe(false);
    expect(withinTolerance(97, 100, 0.02)).toBe(false);
  });

  it("treats the ratio boundary itself as passing", () => {
    expect(withinTolerance(102, 100, 0.02)).toBe(true);
  });

  it("requires an exact match when expected is zero", () => {
    expect(withinTolerance(0, 0, 0.02)).toBe(true);
    expect(withinTolerance(0.01, 0, 0.02)).toBe(false);
  });
});

describe("sameIdentity", () => {
  it("matches regardless of case and surrounding whitespace", () => {
    expect(sameIdentity("Chicken Breast", "  chicken breast ")).toBe(true);
  });

  it("rejects a genuinely different string", () => {
    expect(sameIdentity("chicken breast", "chicken thigh")).toBe(false);
  });
});
