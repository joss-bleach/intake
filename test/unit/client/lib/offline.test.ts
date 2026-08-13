// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useOnlineStatus } from "../../../../src/client/lib/offline";

describe("useOnlineStatus", () => {
  it("reflects navigator.onLine at mount", () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(navigator.onLine);
  });

  it("flips to false on an offline event and back to true on online", () => {
    const { result } = renderHook(() => useOnlineStatus());

    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current).toBe(false);

    act(() => window.dispatchEvent(new Event("online")));
    expect(result.current).toBe(true);
  });
});
