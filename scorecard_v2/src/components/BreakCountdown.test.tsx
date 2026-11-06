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
    // IFAF 2023 R 3-2-1: a two-minute intermission
    expect(timer).toHaveTextContent("02:00");

    act(() => vi.advanceTimersByTime(60_000));
    expect(timer).toHaveTextContent("01:00");

    act(() => vi.advanceTimersByTime(60_000));
    expect(timer).toHaveTextContent("00:00");
    expect(screen.getByRole("timer")).toHaveAccessibleName("Pause vorbei");
    expect(screen.getByRole("button", { name: "Weiter" })).toBeInTheDocument();
  });

  it("counts the intermission the definition gives", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T20:00:00Z"));

    render(
      <BreakCountdown
        onDone={() => undefined}
        startedAt={Date.now()}
        totalSeconds={300}
      />,
    );

    expect(screen.getByRole("timer")).toHaveTextContent("05:00");
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
