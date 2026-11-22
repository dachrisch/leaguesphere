import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConnectionStatus } from "../components/ConnectionStatus";
import { ContextHeader } from "../components/ContextHeader";
import { EventList } from "../components/EventList";
import { Scoreboard } from "../components/Scoreboard";
import { TopBar } from "../components/TopBar";
import { game } from "./fixture";

describe("ContextHeader", () => {
  it("renders league, gameday, field and kickoff", () => {
    render(<ContextHeader game={game} />);
    expect(screen.getByRole("heading", { name: "Testtag" })).toBeInTheDocument();
    expect(screen.getByText(/Testliga/)).toBeInTheDocument();
    expect(screen.getByText(/Feld 1/)).toBeInTheDocument();
  });

  it("falls back to the legacy kickoff when scheduled_at is missing", () => {
    const { container } = render(
      <ContextHeader game={{ ...game, scheduled_at: "", time: "10:00" }} />,
    );
    expect(container.textContent).toContain("Anstoß 10:00");
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

  it("puts field, stage and kickoff into the top line", () => {
    render(<Scoreboard game={game} />);

    expect(screen.getByText(/LIVE · 1\. HZ · Feld 1/)).toBeInTheDocument();
    expect(screen.getByText(/Anstoß 11:30/)).toBeInTheDocument();
  });

  it("shows both halves as one labelled line", () => {
    render(<Scoreboard game={game} />);

    expect(screen.getByText("1. HZ 7:6 · 2. HZ 0:0")).toBeInTheDocument();
  });

  it("derives badges from the distinctive team word", () => {
    render(
      <Scoreboard
        game={{
          ...game,
          home: { ...game.home, name: "Demo Wolves", logo: null },
          away: { ...game.away, name: "Demo Eagles", logo: null },
        }}
      />,
    );

    expect(screen.getByText("WO")).toBeInTheDocument();
    expect(screen.getByText("EA")).toBeInTheDocument();
    expect(screen.queryByText("DE")).not.toBeInTheDocument();
  });

  it("falls back to the full name and shows a missing half as a dash", () => {
    render(
      <Scoreboard
        game={{
          ...game,
          home: { ...game.home, name: "", fh: null, sh: 0, isInPossession: false },
          away: { ...game.away, fh: 0, sh: null },
        }}
      />,
    );
    expect(screen.getAllByText("Walldorf Wanderers").length).toBeGreaterThan(0);
    expect(screen.getAllByText("–").length).toBeGreaterThan(0);
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

  it("names the away team on an away event", () => {
    render(
      <EventList
        game={{
          ...game,
          ticks: [
            {
              text: "Auszeit - 12:00",
              type: "timeout",
              team: "away",
              time: "2026-08-15T12:00:00+00:00",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Düsseldorf Firecats")).toBeInTheDocument();
  });

  it("shows the detail of a first down and a run with its player", () => {
    render(
      <EventList
        game={{
          ...game,
          ticks: [
            {
              text: "First Down - 12 Yards · 2nd & M · A17",
              type: "first_down",
              team: "home",
              time: "2026-08-15T12:00:00+00:00",
            },
            {
              text: "Run: #7 - 12 Yards · 2nd & M · A17",
              type: "run",
              team: "home",
              time: "2026-08-15T12:01:00+00:00",
            },
            {
              text: "1-Extra-Punkt: #3 - nicht verwandelt · Deflection #2",
              type: "extra_point",
              team: "away",
              time: "2026-08-15T12:02:00+00:00",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("First Down")).toBeInTheDocument();
    expect(screen.getByText("12 Yards · 2nd & M · A17")).toBeInTheDocument();
    expect(screen.getByText("Lauf")).toBeInTheDocument();
    expect(screen.getByText("#7 - 12 Yards · 2nd & M · A17")).toBeInTheDocument();
    expect(
      screen.getByText("#3 - nicht verwandelt · Deflection #2"),
    ).toBeInTheDocument();
  });

  it("exposes the all-events toggle with its aria state", async () => {
    const toggle = vi.fn();
    const { rerender } = render(
      <EventList
        game={{ ...game, tick_count: 9 }}
        allExpanded={false}
        onToggleAll={toggle}
      />,
    );
    const button = screen.getByRole("button", { name: "Alle 9 Ereignisse" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "events-1");
    button.click();
    expect(toggle).toHaveBeenCalled();
    rerender(
      <EventList game={{ ...game, tick_count: 9 }} allExpanded onToggleAll={toggle} />,
    );
    expect(screen.getByRole("button", { name: "Weniger anzeigen" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("works without an explicit toggle handler", () => {
    render(<EventList game={{ ...game, tick_count: 9 }} />);
    screen.getByRole("button", { name: "Alle 9 Ereignisse" }).click();
  });

  it("renders a neutral event without a team name", () => {
    render(
      <EventList
        game={{
          ...game,
          ticks: [
            {
              text: "Spiel gestartet",
              type: "period_start",
              team: null,
              time: "2026-08-15T12:00:00+00:00",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Anpfiff")).toBeInTheDocument();
    expect(screen.queryByText("Walldorf Wanderers")).not.toBeInTheDocument();
  });
});

describe("TopBar", () => {
  it("keeps the league above the title so phones never lose it", () => {
    const { container } = render(
      <TopBar
        league="Testliga"
        gamedayName="Testtag"
        liveCount={2}
        shareGame={null}
      />,
    );

    const league = container.querySelector(".lt-topbar-league");
    expect(league).not.toBeNull();
    expect(league).toHaveTextContent("Testliga");
    expect(container.querySelector(".lt-topbar-title")).toHaveTextContent("Testtag");
    expect(container.querySelector(".lt-live-count")).toHaveTextContent("2 LIVE");
  });
});

describe("ConnectionStatus", () => {
  it("stays silent while live so the header badge is the only live mark", () => {
    const { container } = render(<ConnectionStatus status="live" />);
    expect(container.querySelector(".lt-connection")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("announces a polling fallback", () => {
    render(<ConnectionStatus status="polling" />);
    const line = screen.getByRole("status");
    expect(line).toHaveTextContent("Aktualisierung alle 60 s");
    expect(line).toHaveAttribute("aria-live", "polite");
  });

  it("announces a reconnecting stream", () => {
    render(<ConnectionStatus status="reconnecting" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Verbindung wird wiederhergestellt",
    );
  });
});
