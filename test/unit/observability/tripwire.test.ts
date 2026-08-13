import { describe, expect, it } from "vitest";
import { isOverTripwireThreshold } from "../../../src/server/observability/tripwire";

describe("isOverTripwireThreshold", () => {
  it("is false below the threshold", () => {
    expect(isOverTripwireThreshold(99, 100)).toBe(false);
  });

  it("is true at or past the threshold", () => {
    expect(isOverTripwireThreshold(100, 100)).toBe(true);
    expect(isOverTripwireThreshold(101, 100)).toBe(true);
  });
});
