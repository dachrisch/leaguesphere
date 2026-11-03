import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import BreakCountdown from "./BreakCountdown";

afterEach(() => {
  vi.useRealTimers();
});

describe("BreakCountdown", () => {
  it("counts the half-time break down every second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T20:00:00Z"));
    const startedAt = Date.now();

    render(<BreakCountdown onDone={() => undefined} startedAt={startedAt} />);
    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("05:00");

    act(() => vi.advanceTimersByTime(60_000));
    expect(timer).toHaveTextContent("04:00");

    act(() => vi.advanceTimersByTime(240_000));
    expect(timer).toHaveTextContent("00:00");
    expect(screen.getByRole("timer")).toHaveAccessibleName("Pause vorbei");
    expect(screen.getByRole("button", { name: "Weiter" })).toBeInTheDocument();
  });

  it("ends the break when the officials dismiss it", async () => {
    const onDone = vi.fn();
    render(
      <BreakCountdown
        onDone={onDone}
        startedAt={Date.now() - 30_000}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Pause beenden" }),
    );

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
