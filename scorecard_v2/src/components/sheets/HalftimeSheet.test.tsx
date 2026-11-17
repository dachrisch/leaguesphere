import { render, screen, within } from "@testing-library/react";
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

const SETUP = {
  ctResult: "away",
  fhPossession: "home",
  direction: "Nord",
};

function renderSheet(
  overrides: Partial<Parameters<typeof HalftimeSheet>[0]> = {},
): { onStart: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onStart = vi.fn();
  const onClose = vi.fn();
  render(<HalftimeSheet {...FACTS} onClose={onClose} onStart={onStart} {...overrides} />);
  return { onClose, onStart };
}

/** The value of one row in a labelled list. */
function rowValue(list: HTMLElement, label: string): string {
  const term = within(list).getByText(label);
  return term.parentElement?.querySelector("dd")?.textContent?.trim() ?? "";
}

describe("HalftimeSheet", () => {
  it("restates the score and the second-half possession", () => {
    renderSheet();

    expect(screen.getByText("7 : 3 · Ravens – Wolves")).toBeInTheDocument();
    const facts = screen.getByLabelText("Münzwurf");
    expect(rowValue(facts, "Ballbesitz 2. Halbzeit")).toContain("Wolves");
    expect(screen.getByText("2 Minuten")).toBeInTheDocument();
  });

  it("shows the coin toss, who starts and each team's second-half direction", () => {
    renderSheet({ setup: SETUP });

    const toss = screen.getByLabelText("Münzwurf");
    expect(rowValue(toss, "Münzwurf gewonnen von")).toBe("Wolves");
    expect(rowValue(toss, "Erster Ballbesitz")).toBe("Ravens");
    expect(rowValue(toss, "Ballbesitz 2. Halbzeit")).toContain("Wolves");
    expect(rowValue(toss, "Ballbesitz 2. Halbzeit")).toContain(
      "startet mit dem Ball",
    );

    // The team with the second-half kickoff attacks the first half's direction;
    // the other team turns around.
    const directions = screen.getByLabelText("Spielrichtung 2. Halbzeit");
    expect(rowValue(directions, "Wolves")).toBe("Nord");
    expect(rowValue(directions, "Ravens")).toBe("Süd");
  });

  it("reads the older coin-toss values the old app wrote", () => {
    renderSheet({ setup: { ctResult: "gewonnen" } });

    expect(
      rowValue(screen.getByLabelText("Münzwurf"), "Münzwurf gewonnen von"),
    ).toBe("Wolves");
  });

  it("falls back to the direction the caller derived without a setup", () => {
    renderSheet({ setup: null, direction: "Süd" });

    const directions = screen.getByLabelText("Spielrichtung 2. Halbzeit");
    expect(rowValue(directions, "Wolves")).toBe("Nord");
    expect(rowValue(directions, "Ravens")).toBe("Süd");
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
