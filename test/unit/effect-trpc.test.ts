import { describe, expect, it } from "vitest";
import { Data, Effect } from "effect";
import { TRPCError } from "@trpc/server";
import { runEffect } from "../../src/server/effect-trpc";

class BoomError extends Data.TaggedError("BoomError")<{
  readonly message: string;
}> {}

describe("runEffect", () => {
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
});
