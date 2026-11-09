import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import HalftimeSheet from "./HalftimeSheet";

const FACTS = {
  home: "Ravens",
  away: "Wolves",
  homeScore: 7,
  awayScore: 3,
  possession: "Wolves",
  direction: "Süd",
  intermissionMinutes: 2,
};

function renderSheet(
  overrides: Partial<Parameters<typeof HalftimeSheet>[0]> = {},
): { onStart: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onStart = vi.fn();
  const onClose = vi.fn();
  render(<HalftimeSheet {...FACTS} onClose={onClose} onStart={onStart} {...overrides} />);
  return { onClose, onStart };
}

describe("HalftimeSheet", () => {
  it("restates the score, the second-half possession and the direction", () => {
    renderSheet();

    expect(screen.getByText("7 : 3 · Ravens – Wolves")).toBeInTheDocument();
    expect(screen.getByText("Wolves")).toBeInTheDocument();
    expect(screen.getByText("Süd")).toBeInTheDocument();
    expect(screen.getByText("2 Minuten")).toBeInTheDocument();
  });

  it("starts the half only on the dialog's button", async () => {
    const user = userEvent.setup();
    const { onStart } = renderSheet();

    await user.click(screen.getByRole("button", { name: "Halbzeit starten" }));

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("shows the server's reason and stays open on a failure", () => {
    renderSheet({ error: "Dieser Spielstatus erlaubt keine Halbzeit." });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Dieser Spielstatus erlaubt keine Halbzeit.",
    );
  });

  it("disables the start while the write is in flight", () => {
    renderSheet({ busy: true });

    expect(
      screen.getByRole("button", { name: "Halbzeit …" }),
    ).toBeDisabled();
  });
});
