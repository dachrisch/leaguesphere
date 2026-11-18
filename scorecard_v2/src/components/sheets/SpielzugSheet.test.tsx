import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import SpielzugSheet, { type SpielzugPick } from "./SpielzugSheet";

function renderSheet(
  overrides: Partial<Parameters<typeof SpielzugSheet>[0]> = {},
): {
  onClose: ReturnType<typeof vi.fn>;
  onPick: ReturnType<typeof vi.fn>;
  onPlay: ReturnType<typeof vi.fn>;
} {
  const onClose = vi.fn();
  const onPick = vi.fn<(pick: SpielzugPick) => void>();
  const onPlay = vi.fn();
  render(
    <SpielzugSheet
      onClose={onClose}
      onPick={onPick}
      onPlay={onPlay}
      {...overrides}
    />,
  );
  return { onClose, onPick, onPlay };
}

describe("SpielzugSheet", () => {
  it("offers the two plays, the rarer entries and the game phases", () => {
    renderSheet();

    for (const label of [
      "Pass",
      "Run",
      "Turnover",
      "1st Down",
      "Safety",
      "Challenge",
      "Overtime",
      "Feldposition",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    // Sack, Interception and the short-form touchdown are results/details of
    // the play wizard now, not entries of this sheet.
    for (const label of ["Sack", "Interception", "Touchdown (Kurzform)"]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
    expect(
      screen.getByRole("heading", { name: "Spielphase" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["Pass", "pass", undefined],
    ["Run", "run", undefined],
  ] as const)("opens the play wizard for %s", async (label, type, result) => {
    const user = userEvent.setup();
    const { onPlay, onPick } = renderSheet();

    await user.click(screen.getByRole("button", { name: label }));

    expect(onPlay).toHaveBeenCalledWith(type, result);
    expect(onPick).not.toHaveBeenCalled();
  });

  it.each([
    ["Turnover", "turnover"],
    ["1st Down", "first"],
    ["Safety", "safety"],
    ["Challenge", "challenge"],
    ["Overtime", "overtime"],
    ["Feldposition", "fieldpos"],
  ] as const)("picks %s", async (label, pick) => {
    const user = userEvent.setup();
    const { onPick, onPlay } = renderSheet();

    await user.click(screen.getByRole("button", { name: label }));

    expect(onPick).toHaveBeenCalledWith(pick);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it("picks a tile with its number key", () => {
    const { onPick, onPlay } = renderSheet();

    fireEvent.keyDown(window, { key: "1" });
    expect(onPlay).toHaveBeenCalledWith("pass", undefined);

    fireEvent.keyDown(window, { key: "2" });
    expect(onPlay).toHaveBeenCalledWith("run", undefined);

    fireEvent.keyDown(window, { key: "3" });
    expect(onPick).toHaveBeenCalledWith("turnover");

    fireEvent.keyDown(window, { key: "0" });
    expect(onPick).toHaveBeenCalledWith("overtime");
  });

  it("ignores keys that are not a tile and modified digits", () => {
    const { onPick, onPlay } = renderSheet();

    fireEvent.keyDown(window, { key: "x" });
    fireEvent.keyDown(window, { key: "1", ctrlKey: true });
    fireEvent.keyDown(window, { key: "1", repeat: true });

    expect(onPlay).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("disables every tile while a write is in flight", () => {
    renderSheet({ disabled: true });

    for (const button of screen.getAllByRole("button")) {
      if (button.textContent === "Schließen") {
        continue;
      }
      expect(button).toBeDisabled();
    }
  });

  it("does not pick from a key while disabled", () => {
    const { onPick, onPlay } = renderSheet({ disabled: true });

    fireEvent.keyDown(window, { key: "1" });

    expect(onPlay).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("closes on request", async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet();

    await user.click(screen.getByRole("button", { name: "Schließen" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
