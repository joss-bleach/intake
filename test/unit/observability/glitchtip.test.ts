import { Cause, FiberId, Runtime } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();

// Stubbed rather than pointed at a real GlitchTip instance — this proves
// captureEffectFailure unwraps Effect's Cause/FiberFailure shapes correctly,
// not that the SDK can reach a real server (out of scope here; see
// docker-compose.yml's glitchtip-* services for that).
vi.mock("@sentry/core", () => ({
  init: vi.fn(),
  captureException,
  captureMessage: vi.fn(),
}));

const { captureEffectFailure } = await import(
  "../../../src/server/observability/glitchtip"
);

describe("captureEffectFailure", () => {
  beforeEach(() => {
    captureException.mockClear();
  });

  it("unwraps a plain Cause.fail down to the underlying error", () => {
    const error = new Error("boom");

    captureEffectFailure(Cause.fail(error));

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][0]).toBe(error);
  });

  it("unwraps a Runtime.FiberFailure (what Effect.runPromise/runSync throw) to its wrapped Cause", () => {
    const error = new Error("died");
    const fiberFailure = Runtime.makeFiberFailure(Cause.die(error));

    captureEffectFailure(fiberFailure);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][0]).toBe(error);
  });

  it("wraps a non-Error defect in an Error rather than passing it through raw", () => {
    captureEffectFailure(Cause.die("not an Error instance"));

    expect(captureException).toHaveBeenCalledTimes(1);
    const reported = captureException.mock.calls[0][0];
    expect(reported).toBeInstanceOf(Error);
    expect(reported.message).toContain("not an Error instance");
  });

  it("accepts a bare thrown value directly, same as Cause.die would produce", () => {
    const error = new Error("thrown directly");

    captureEffectFailure(error);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][0]).toBe(error);
  });

  it("skips reporting an interruption-only cause — a cancelled fiber isn't a real error", () => {
    const interrupted = Cause.interrupt(FiberId.make(0, 0));

    captureEffectFailure(interrupted);

    expect(captureException).not.toHaveBeenCalled();
  });
});
