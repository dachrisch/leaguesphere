import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContextHeader } from "../components/ContextHeader";
import { EventList } from "../components/EventList";
import { Scoreboard } from "../components/Scoreboard";
import { game } from "./fixture";

describe("ContextHeader", () => {
  it("renders league, gameday, field and kickoff", () => {
    render(<ContextHeader game={game} />);
    expect(screen.getByRole("heading", { name: "Testtag" })).toBeInTheDocument();
    expect(screen.getByText(/Testliga/)).toBeInTheDocument();
    expect(screen.getByText(/Feld 1/)).toBeInTheDocument();
  });

  it("does not add empty context parts", () => {
    render(
      <ContextHeader
        game={{
          ...game,
          league: "",
          gameday: { ...game.gameday, address: "", name: "" },
          field: 0,
          stage: "",
          standing: "",
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Liveticker" })).toBeInTheDocument();
  });
});

describe("Scoreboard", () => {
  it("renders halves, possession and a logo", () => {
    render(
      <Scoreboard
        game={{
          ...game,
          home: { ...game.home, logo: "/media/home.png" },
        }}
      />,
    );
    expect(screen.getByText("Ballbesitz")).toBeInTheDocument();
    expect(document.querySelector("img")).toHaveAttribute("src", "/media/home.png");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("omits the half table when no halves were entered", () => {
    render(
      <Scoreboard
        game={{
          ...game,
          home: { ...game.home, fh: null, sh: null, isInPossession: false },
          away: { ...game.away, fh: null, sh: null },
        }}
      />,
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Ballbesitz")).not.toBeInTheDocument();
  });
});

describe("EventList", () => {
  it("shows an empty state without ticks", () => {
    render(<EventList game={{ ...game, ticks: [] }} />);
    expect(screen.getByText("Noch keine Ereignisse.")).toBeInTheDocument();
  });

  it("renders a neutral event without a team name", () => {
    render(
      <EventList
        game={{
          ...game,
          ticks: [
            {
              text: "Spiel gestartet",
              team: null,
              time: "2026-08-15T12:00:00+00:00",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Spiel gestartet")).toBeInTheDocument();
    expect(screen.queryByText("Walldorf Wanderers")).not.toBeInTheDocument();
  });
});
