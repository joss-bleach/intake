import { beforeEach, describe, expect, it, vi } from "vitest";
import { Data, Effect } from "effect";
import { TRPCError } from "@trpc/server";

const captureEffectFailure = vi.fn();
vi.mock("../../src/server/observability/glitchtip", () => ({
  captureEffectFailure,
}));

const { runEffect } = await import("../../src/server/effect-trpc");

class BoomError extends Data.TaggedError("BoomError")<{
  readonly message: string;
}> {}

class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly message: string;
  readonly code: "NOT_FOUND";
}> {}

describe("runEffect", () => {
  beforeEach(() => {
    captureEffectFailure.mockClear();
  });

  it("resolves with the success value", async () => {
    await expect(runEffect(Effect.succeed(42))).resolves.toBe(42);
  });

  it("translates a typed Effect failure into a TRPCError", async () => {
    const program = Effect.fail(new BoomError({ message: "kaboom" }));

    await expect(runEffect(program)).rejects.toBeInstanceOf(TRPCError);
    await expect(runEffect(program)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "kaboom",
    });
  });

  it("translates a defect (unexpected throw) into a TRPCError", async () => {
    const program = Effect.sync(() => {
      throw new Error("unexpected");
    });

    await expect(runEffect(program)).rejects.toBeInstanceOf(TRPCError);
  });

  it("reports a defect to GlitchTip", async () => {
    const program = Effect.sync(() => {
      throw new Error("unexpected");
    });

    await expect(runEffect(program)).rejects.toBeInstanceOf(TRPCError);
    expect(captureEffectFailure).toHaveBeenCalledTimes(1);
  });

  it("reports a typed failure that reaches the client as a 500", async () => {
    const program = Effect.fail(new BoomError({ message: "kaboom" }));

    await expect(runEffect(program)).rejects.toBeInstanceOf(TRPCError);
    expect(captureEffectFailure).toHaveBeenCalledTimes(1);
  });

  it("does not report an expected failure that names its own non-500 code", async () => {
    const program = Effect.fail(
      new NotFoundError({ message: "no such food", code: "NOT_FOUND" }),
    );

    await expect(runEffect(program)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(captureEffectFailure).not.toHaveBeenCalled();
  });

  it("still throws the original TRPCError when reporting itself fails", async () => {
    captureEffectFailure.mockImplementationOnce(() => {
      throw new Error("reporter is down");
    });
    const program = Effect.fail(new BoomError({ message: "kaboom" }));

    await expect(runEffect(program)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "kaboom",
    });
  });
});
