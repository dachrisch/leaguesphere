import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { RosterPlayer } from "../../api/types";
import QuarterbackSheet from "./QuarterbackSheet";

const ROSTER: RosterPlayer[] = [
  { side: "home", jersey: 7, name: "Meier" },
  { side: "home", jersey: 23, name: "Schulz" },
  { side: "away", jersey: 11, name: "Wolf" },
];

function renderSheet(
  overrides: Partial<Parameters<typeof QuarterbackSheet>[0]> = {},
): { onSubmit: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onSubmit = vi.fn(async () => undefined);
  const onClose = vi.fn();
  render(
    <QuarterbackSheet
      onClose={onClose}
      onSubmit={onSubmit}
      roster={ROSTER}
      side="home"
      teamName="Ravens"
      value={7}
      {...overrides}
    />,
  );
  return { onClose, onSubmit };
}

describe("QuarterbackSheet", () => {
  it("preselects the stored default and saves the new one", async () => {
    const user = userEvent.setup();
    const { onSubmit, onClose } = renderSheet();

    expect(screen.getByRole("button", { name: "QB 7, Meier" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "QB 23, Schulz" }));
    await user.click(screen.getByRole("button", { name: "QB speichern" }));

    expect(onSubmit).toHaveBeenCalledWith(23);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("can clear the default so every pass asks again", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet();

    await user.click(screen.getByRole("button", { name: "Ohne QB" }));
    await user.click(screen.getByRole("button", { name: "QB speichern" }));

    expect(onSubmit).toHaveBeenCalledWith(null);
  });
});
