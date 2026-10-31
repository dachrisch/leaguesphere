import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ARM_MS, useArmed } from "./useArmed";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useArmed", () => {
  it("arms one button and reverts it after the window", () => {
    const { result } = renderHook(() => useArmed<"halftime" | "first">());
    expect(result.current.armed).toBeNull();

    act(() => result.current.arm("halftime"));
    expect(result.current.armed).toBe("halftime");

    act(() => vi.advanceTimersByTime(ARM_MS - 1));
    expect(result.current.armed).toBe("halftime");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.armed).toBeNull();
  });

  it("lets a second button replace the first and restarts the window", () => {
    const { result } = renderHook(() => useArmed<"halftime" | "first">());

    act(() => result.current.arm("halftime"));
    act(() => vi.advanceTimersByTime(ARM_MS - 1000));
    act(() => result.current.arm("first"));
    expect(result.current.armed).toBe("first");

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.armed).toBe("first");
    act(() => vi.advanceTimersByTime(ARM_MS - 1000));
    expect(result.current.armed).toBeNull();
  });

  it("disarms on request and leaves no timer behind", () => {
    const { result, unmount } = renderHook(() => useArmed<"halftime">());

    act(() => result.current.arm("halftime"));
    act(() => result.current.disarm());
    expect(result.current.armed).toBeNull();

    act(() => result.current.arm("halftime"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
