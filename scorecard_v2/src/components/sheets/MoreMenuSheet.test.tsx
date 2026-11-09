import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import MoreMenuSheet, { type MorePick } from "./MoreMenuSheet";

function renderMenu(
  overrides: Partial<Parameters<typeof MoreMenuSheet>[0]> = {},
): { onPick: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onPick = vi.fn<(pick: MorePick) => void>();
  const onClose = vi.fn();
  render(<MoreMenuSheet onClose={onClose} onPick={onPick} {...overrides} />);
  return { onClose, onPick };
}

describe("MoreMenuSheet", () => {
  it("lists the entries the board keeps out of its six tiles", () => {
    renderMenu();

    for (const label of [
      "Turnover",
      "1st Down",
      "Safety",
      "Overtime",
      "Challenge",
      "Feldposition",
      "Touchdown (Kurzform)",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it.each([
    ["Turnover", "turnover"],
    ["1st Down", "first"],
    ["Safety", "safety"],
    ["Overtime", "overtime"],
    ["Challenge", "challenge"],
    ["Feldposition", "fieldpos"],
    ["Touchdown (Kurzform)", "touchdown"],
  ] as const)("opens %s", async (label, pick) => {
    const user = userEvent.setup();
    const { onPick } = renderMenu();

    await user.click(screen.getByRole("button", { name: label }));

    expect(onPick).toHaveBeenCalledWith(pick);
  });

  it("disables every row while a write is in flight", () => {
    renderMenu({ disabled: true });

    for (const button of screen.getAllByRole("button")) {
      if (button.textContent === "Schließen") {
        continue;
      }
      expect(button).toBeDisabled();
    }
  });

  it("closes on request", async () => {
    const user = userEvent.setup();
    const { onClose } = renderMenu();

    await user.click(screen.getByRole("button", { name: "Schließen" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
