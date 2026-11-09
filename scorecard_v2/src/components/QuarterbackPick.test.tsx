import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { RosterPlayer } from "../api/types";
import QuarterbackPick from "./QuarterbackPick";

const ROSTER: RosterPlayer[] = [
  { side: "home", jersey: 7, name: "Meier" },
  { side: "home", jersey: 12, name: "Kern" },
  { side: "away", jersey: 11, name: "Wolf" },
];

function renderPick(
  overrides: Partial<Parameters<typeof QuarterbackPick>[0]> = {},
): { onChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn();
  render(
    <QuarterbackPick
      onChange={onChange}
      roster={ROSTER}
      side="home"
      value={12}
      {...overrides}
    />,
  );
  return { onChange };
}

describe("QuarterbackPick", () => {
  it("shows the remembered number with ändern", () => {
    renderPick();

    expect(screen.getByText("#12")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ändern" }),
    ).toBeInTheDocument();
  });

  it("opens the grid on ändern and reports a new number", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPick();

    await user.click(screen.getByRole("button", { name: "ändern" }));
    await user.click(screen.getByRole("button", { name: "QB 7, Meier" }));

    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("opens the grid when no quarterback is known yet", () => {
    renderPick({ value: null });

    expect(
      screen.getByRole("button", { name: "QB 7, Meier" }),
    ).toBeInTheDocument();
  });

  it("can clear the choice", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPick({ value: null });

    await user.click(screen.getByRole("button", { name: "Ohne QB" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("disables ändern while a write is in flight", () => {
    renderPick({ disabled: true });

    expect(screen.getByRole("button", { name: "ändern" })).toBeDisabled();
  });
});
