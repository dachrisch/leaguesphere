import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { RosterPlayer } from "../../api/types";
import PlaySheet, { playEvent, playInput, playName } from "./PlaySheet";
import { yardsValue } from "./yards";

const ROSTER: RosterPlayer[] = [
  { side: "home", jersey: 7, name: "Meier" },
  { side: "home", jersey: 12, name: "Kern" },
  { side: "home", jersey: 23, name: "Schulz" },
  { side: "away", jersey: 11, name: "Wolf" },
];

function renderSheet(
  overrides: Partial<Parameters<typeof PlaySheet>[0]> = {},
): { onSubmit: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onSubmit = vi.fn(async () => undefined);
  const onClose = vi.fn();
  render(
    <PlaySheet
      onClose={onClose}
      onSubmit={onSubmit}
      roster={ROSTER}
      side="home"
      teamName="Ravens"
      {...overrides}
    />,
  );
  return { onClose, onSubmit };
}

describe("PlaySheet helpers", () => {
  it("names the row by play type and pass result", () => {
    expect(playName("pass", true)).toBe("Pass");
    expect(playName("pass", false)).toBe("Pass unvollständig");
    expect(playName("run", true)).toBe("Run");
    expect(playName("sack", true)).toBe("Sack");
  });

  it("writes the visible text of a complete pass", () => {
    expect(playInput({ type: "pass", complete: true, yards: 8, qb: 12 })).toBe(
      "8 Yards · QB #12",
    );
  });

  it("drops the yards of an incomplete pass but keeps the thrower", () => {
    expect(
      playInput({ type: "pass", complete: false, yards: 0, qb: 12 }),
    ).toBe("QB #12");
  });

  it("writes the loss of a sack as words", () => {
    expect(playInput({ type: "sack", complete: true, yards: 5, qb: null })).toBe(
      "5 Yards Verlust",
    );
  });

  it("stores the yards signed, so a sack is a loss", () => {
    const sack = playEvent({
      type: "sack",
      complete: true,
      yards: 5,
      qb: null,
      player: 12,
    });
    expect(sack).toEqual({
      name: "Sack",
      player: 12,
      input: "5 Yards Verlust",
      payload: { yards: -5 },
    });

    const pass = playEvent({
      type: "pass",
      complete: true,
      yards: 8,
      qb: 12,
      player: 7,
    });
    expect(pass).toEqual({
      name: "Pass",
      player: 7,
      input: "8 Yards · QB #12",
      payload: { yards: 8, complete: true, qb: 12 },
    });
  });

  it("keeps the payload free of details that do not apply", () => {
    expect(
      playEvent({ type: "run", complete: true, yards: 14, qb: 12, player: 23 }),
    ).toEqual({
      name: "Run",
      player: 23,
      input: "14 Yards",
      payload: { yards: 14 },
    });
  });

  it("reads the yards field as a signed two-digit number", () => {
    expect(yardsValue("8")).toBe(8);
    expect(yardsValue("-5")).toBe(-5);
    expect(yardsValue("")).toBeNull();
    expect(yardsValue("-")).toBeNull();
    expect(yardsValue("1a2")).toBe(12);
    expect(yardsValue("123")).toBe(12);
  });
});

describe("PlaySheet", () => {
  it("records a pass with receiver, yards and thrower", async () => {
    const user = userEvent.setup();
    const { onSubmit, onClose } = renderSheet({ lastQuarterback: 12 });

    await user.click(screen.getByRole("button", { name: "Trikot 7, Meier" }));
    const yards = screen.getByRole("textbox", { name: /Raumgewinn/ });
    await user.clear(yards);
    await user.type(yards, "8");
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Pass",
      player: 7,
      input: "8 Yards · QB #12",
      payload: { yards: 8, complete: true, qb: 12 },
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks for the thrower on a pass and remembers the last one", () => {
    renderSheet({ lastQuarterback: 12 });

    expect(
      screen.getByRole("button", { name: "QB 12, Kern" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("refuses a pass before a quarterback is picked", () => {
    renderSheet();

    expect(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Bitte den Quarterback wählen."),
    ).toBeInTheDocument();
  });

  it("records a negative gain for a short pass carried backwards", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ lastQuarterback: 12 });

    await user.click(screen.getByRole("button", { name: "Trikot 7, Meier" }));
    await user.click(screen.getByRole("button", { name: "Verlust" }));
    const yards = screen.getByRole("textbox", { name: /Raumgewinn/ });
    await user.clear(yards);
    await user.type(yards, "4");
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Pass",
      player: 7,
      input: "4 Yards Verlust · QB #12",
      payload: { yards: -4, complete: true, qb: 12 },
    });
  });

  it("records a run without a quarterback or a pass result", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet();

    await user.click(screen.getByRole("button", { name: "Run" }));
    await user.click(screen.getByRole("button", { name: "Trikot 23, Schulz" }));
    const yards = screen.getByRole("textbox", { name: /Raumgewinn/ });
    await user.clear(yards);
    await user.type(yards, "14");
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Run",
      player: 23,
      input: "14 Yards",
      payload: { yards: 14 },
    });
  });

  it("records an incomplete pass towards a receiver", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ lastQuarterback: 12 });

    await user.click(screen.getByRole("button", { name: "Incomplete" }));
    await user.click(screen.getByRole("button", { name: "Trikot 7, Meier" }));
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Pass unvollständig",
      player: 7,
      input: "QB #12",
      payload: { yards: 0, complete: false, qb: 12 },
    });
  });

  it("records a sack as a loss", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet();

    await user.click(screen.getByRole("button", { name: "Sack" }));
    await user.click(screen.getByRole("button", { name: "Trikot 12, Kern" }));
    const yards = screen.getByRole("textbox", { name: /Raumverlust/ });
    await user.clear(yards);
    await user.type(yards, "5");
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Sack",
      player: 12,
      input: "5 Yards Verlust",
      payload: { yards: -5 },
    });
  });

  it("falls back to the numeric fields while no roster is loaded", () => {
    renderSheet({ roster: null });

    // Yards, jersey, quarterback and defender are each a plain number.
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
    expect(screen.getAllByText(/Kein Kader geladen/).length).toBeGreaterThan(0);
  });

  it("lists the defender who made the tackle, from the other team", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ lastQuarterback: 12 });

    await user.click(
      await screen.findByRole("button", { name: "Trikot 7, Meier" }),
    );
    await user.click(screen.getByRole("button", { name: "Defense 11, Wolf" }));
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Pass",
      player: 7,
      input: "0 Yards · QB #12 · Tackle #11",
      payload: {
        yards: 0,
        complete: true,
        qb: 12,
        defense: { player: 11 },
      },
    });
  });

  it("records a deflection on an incomplete pass", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderSheet({ lastQuarterback: 12 });

    await user.click(screen.getByRole("button", { name: "Incomplete" }));
    await user.click(screen.getByRole("button", { name: "Deflection" }));
    await user.click(
      await screen.findByRole("button", { name: "Defense 11, Wolf" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Pass unvollständig",
      input: "QB #12 · Deflection #11",
      payload: {
        yards: 0,
        complete: false,
        qb: 12,
        defense: { player: 11, deflection: true },
      },
    });
  });

  it("offers no defender on a sack", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole("button", { name: "Sack" }));

    expect(screen.queryByRole("group", { name: "Deflection" })).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Trikotnummer Defense" }),
    ).toBeNull();
  });

  it("keeps the sheet open with the reason when the write fails", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {
      throw new Error("kaputt");
    });
    renderSheet({ lastQuarterback: 12, onSubmit });

    await user.click(
      screen.getByRole("button", { name: "Spielzug speichern" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Der Spielzug konnte nicht gespeichert werden",
    );
  });
});
