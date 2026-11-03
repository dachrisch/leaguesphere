import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Game, GameLog } from "../api/types";
import ResultScreen from "./Result";

const GAME: Game = {
  id: 42,
  scheduled: "13:30:00",
  field: 2,
  officials: "Crew Rhein",
  officialsId: 7,
  stage: "Vorrunde",
  standing: "",
  home: "Ravens",
  away: "Wolves",
  points_home: 21,
  points_away: 14,
  status: "beendet",
  id_home: "11",
  id_away: "12",
  passcheck: true,
};

const LOG: GameLog = {
  gameId: 42,
  isFirstHalf: false,
  inPossession: null,
  events: [
    {
      id: 1,
      seq: 1,
      sequence: 1,
      team: "Ravens",
      event: "Touchdown",
      player: 23,
      input: null,
      half: 1,
      cop: false,
      isDeleted: false,
      time: "2026-10-26T12:00:00Z",
    },
    {
      id: 2,
      seq: 2,
      sequence: 2,
      team: "Wolves",
      event: "1-Extra-Punkt",
      player: 9,
      input: null,
      half: 2,
      cop: false,
      isDeleted: false,
      time: "2026-10-26T12:30:00Z",
    },
  ],
  home: {
    id: 1,
    name: "Ravens",
    score: 21,
    firsthalf: { score: 14, entries: [] },
    secondhalf: { score: 7, entries: [] },
  },
  away: {
    id: 2,
    name: "Wolves",
    score: 14,
    firsthalf: { score: 7, entries: [] },
    secondhalf: { score: 7, entries: [] },
  },
};

function renderResult() {
  const onDone = vi.fn();
  render(<ResultScreen game={GAME} log={LOG} onDone={onDone} />);
  return { onDone };
}

describe("Result", () => {
  it("confirms the sent result", () => {
    renderResult();

    expect(
      screen.getByRole("heading", { level: 1, name: "Ergebnis gesendet" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Spiel beendet")).toBeInTheDocument();
    expect(
      screen.getByText("Tabelle und Liveticker sind aktuell."),
    ).toBeInTheDocument();
  });

  it("shows the final score and both half scores", () => {
    renderResult();

    const board = screen.getByLabelText("Spielstand");
    expect(board.querySelector(".finalpoints")).toHaveTextContent("21:14");

    const halves = within(board).getByRole("table", {
      name: "Halbzeit-Ergebnisse",
    });
    expect(
      within(halves).getByRole("row", { name: "Ravens 14 7" }),
    ).toBeInTheDocument();
    expect(
      within(halves).getByRole("row", { name: "Wolves 7 7" }),
    ).toBeInTheDocument();
  });

  it("shows everything the game recorded, read-only", () => {
    renderResult();

    const log = screen.getByRole("region", { name: "Spielverlauf" });
    expect(within(log).getByText("Touchdown Ravens")).toBeInTheDocument();
    expect(within(log).getByText("1 Extrapunkt Wolves")).toBeInTheDocument();
    // Read-only: no undo, no edit, no keyboard hint.
    expect(within(log).queryByRole("button", { name: /Rückgängig/ })).toBeNull();
    expect(within(log).queryByRole("button", { name: /Ändern/ })).toBeNull();
    expect(within(log).queryByText(/Letzten Eintrag rückgängig/)).toBeNull();
  });

  it("starts the next game", async () => {
    const { onDone } = renderResult();

    await userEvent.click(screen.getByRole("button", { name: "Neues Spiel" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("names the game in the header", () => {
    renderResult();

    expect(screen.getByText("Ravens – Wolves · Feld 2")).toBeInTheDocument();
  });

  it("falls back to the game's teams when the log has no names", () => {
    const nameless: GameLog = {
      ...LOG,
      home: { ...LOG.home, name: null },
      away: { ...LOG.away, name: "" },
    };
    render(<ResultScreen game={GAME} log={nameless} onDone={() => undefined} />);

    expect(screen.getByText("Ravens – Wolves · Feld 2")).toBeInTheDocument();
  });
});
