import { describe, expect, it } from "vitest";
import { directionForPct } from "../../../../src/server/insights/nrv-reference";

describe("directionForPct", () => {
  it("flags under 90% as needing more", () => {
    expect(directionForPct(89)).toBe("more");
    expect(directionForPct(0)).toBe("more");
  });

  it("flags over 110% as needing less", () => {
    expect(directionForPct(111)).toBe("less");
    expect(directionForPct(250)).toBe("less");
  });

  it("treats 90-110% inclusive as on target", () => {
    expect(directionForPct(90)).toBe("on-target");
    expect(directionForPct(100)).toBe("on-target");
    expect(directionForPct(110)).toBe("on-target");
  });
});
