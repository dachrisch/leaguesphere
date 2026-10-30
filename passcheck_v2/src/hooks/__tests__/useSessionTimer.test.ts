import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";

import { useSessionTimer } from "../useSessionTimer";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it("starts once and tracks elapsed time", () => {
  const { result } = renderHook(() => useSessionTimer());

  expect(result.current.startedAt).toBeNull();

  act(() => {
    result.current.start();
  });
  const startedAt = result.current.startedAt;
  expect(startedAt).not.toBeNull();

  act(() => {
    result.current.start();
  });
  expect(result.current.startedAt).toBe(startedAt);

  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(result.current.elapsedMs).toBeGreaterThanOrEqual(2000);
});
