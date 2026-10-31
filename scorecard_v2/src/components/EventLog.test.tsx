// The log renderer's data work: rows from the server's events (and from the
// scoring entries of an older server), the labels, the undo body and the list.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  GameLog,
  GameLogEvent,
  GameLogTeam,
  LogEntry,
} from "../api/types";
import EventLog, {
  describeRow,
  formatLogTime,
  isMarker,
  logRows,
  undoBody,
  type LogRow,
} from "./EventLog";

function team(overrides: Partial<GameLogTeam> = {}): GameLogTeam {
  return {
    id: 1,
    name: "Ravens",
    score: 0,
    firsthalf: { score: 0, entries: [] },
    secondhalf: { score: 0, entries: [] },
    ...overrides,
  };
}

function event(overrides: Partial<GameLogEvent> = {}): GameLogEvent {
  return {
    id: 10,
    sequence: 1,
    team: "Ravens",
    event: "First Down",
    player: null,
    input: null,
    half: 1,
    cop: false,
    isDeleted: false,
    time: "2026-10-26T12:00:00Z",
    ...overrides,
  };
}

function row(overrides: Partial<LogRow> = {}): LogRow {
  return {
    key: "e1",
    teamLogId: 1,
    seq: null,
    sequence: 1,
    team: "Ravens",
    event: "First Down",
    player: null,
    input: null,
    half: 1,
    cop: false,
    isDeleted: false,
    time: "2026-10-26T12:00:00Z",
    ...overrides,
  };
}

function log(overrides: Partial<GameLog> = {}): GameLog {
  return {
    gameId: 42,
    isFirstHalf: true,
    inPossession: "Ravens",
    events: [],
    home: team(),
    away: team({ id: 2, name: "Wolves" }),
    ...overrides,
  };
}

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return { ...overrides, sequence: overrides.sequence ?? 1 };
}

describe("logRows", () => {
  it("maps the server's events and trims the input", () => {
    const rows = logRows(
      log({
        events: [
          event({ id: 5, input: "  Holding  ", time: "2026-10-26T12:00:00Z" }),
        ],
      }),
    );

    expect(rows).toEqual([
      {
        key: "e5",
        teamLogId: 5,
        seq: null,
        sequence: 1,
        team: "Ravens",
        event: "First Down",
        player: null,
        input: "Holding",
        half: 1,
        cop: false,
        isDeleted: false,
        time: "2026-10-26T12:00:00Z",
      },
    ]);
  });

  it("keeps a blank input and a missing time as null", () => {
    const [only] = logRows(
      log({
        events: [
          event({ input: "   ", time: undefined as unknown as string }),
        ],
      }),
    );

    expect(only?.input).toBeNull();
    expect(only?.time).toBeNull();
  });

  it("rebuilds the scoring rows of a server without events", () => {
    const rows = logRows(
      log({
        events: undefined,
        home: team({
          firsthalf: {
            score: 6,
            entries: [
              entry({
                sequence: 3,
                time: "2026-10-26T12:00:00Z",
                td: 23,
                pat1: null,
                cop: true,
                name: "Turnover",
                player: 11,
              }),
            ],
          },
        }),
      }),
    );

    expect(rows.map((entryRow) => entryRow.event)).toEqual(
      expect.arrayContaining(["Touchdown", "1-Extra-Punkt", "Turnover"]),
    );
    const touchdown = rows.find((entryRow) => entryRow.event === "Touchdown");
    expect(touchdown).toMatchObject({
      teamLogId: null,
      team: "Ravens",
      half: 1,
      player: 23,
      input: null,
      isDeleted: false,
      time: "2026-10-26T12:00:00Z",
    });
    // A conversion without a jersey keeps `player: null`.
    expect(
      rows.find((entryRow) => entryRow.event === "1-Extra-Punkt")?.player,
    ).toBeNull();
    // A cop row names the event and the defender.
    expect(rows.find((entryRow) => entryRow.event === "Turnover")).toMatchObject(
      { player: 11, input: null },
    );
  });

  it("keeps the unknown keys of an old entry as events and skips the ignored ones", () => {
    const rows = logRows(
      log({
        events: undefined,
        away: team({
          id: 2,
          name: "Wolves",
          secondhalf: {
            score: 0,
            entries: [
              entry({
                sequence: 4,
                isDeleted: true,
                cop: false,
                Kragen: 7,
                Notiz: null,
              }),
            ],
          },
        }),
      }),
    );

    expect(rows.map((entryRow) => entryRow.event)).toEqual(["Kragen", "Notiz"]);
    expect(rows[0]).toMatchObject({
      half: 2,
      team: "Wolves",
      player: 7,
      isDeleted: true,
    });
    expect(rows[1]?.player).toBeNull();
  });

  it("puts a timed row ahead of an untimed one in either input order", () => {
    const timed = entry({ sequence: 1, time: "2026-10-26T10:00:00Z", td: 1 });
    const untimed = entry({ sequence: 2, td: 2 });

    const untimedFirst = logRows(
      log({
        events: undefined,
        home: team({
          firsthalf: { score: 0, entries: [untimed] },
          secondhalf: { score: 0, entries: [timed] },
        }),
      }),
    );
    const timedFirst = logRows(
      log({
        events: undefined,
        home: team({
          firsthalf: { score: 0, entries: [timed] },
          secondhalf: { score: 0, entries: [untimed] },
        }),
      }),
    );

    expect(untimedFirst.map((entryRow) => entryRow.sequence)).toEqual([1, 2]);
    expect(timedFirst.map((entryRow) => entryRow.sequence)).toEqual([1, 2]);
  });

  it("orders two untimed rows by half, then by sequence", () => {
    const rows = logRows(
      log({
        events: undefined,
        home: team({
          firsthalf: { score: 0, entries: [entry({ sequence: 4, td: 1 })] },
          secondhalf: { score: 0, entries: [entry({ sequence: 2, td: 2 })] },
        }),
      }),
    );

    expect(rows.map((entryRow) => entryRow.half)).toEqual([2, 1]);
  });

  it("sorts newest first by time, then half, then sequence", () => {
    const rows = logRows(
      log({
        events: undefined,
        home: team({
          firsthalf: {
            score: 0,
            entries: [
              entry({ sequence: 1, time: "2026-10-26T10:00:00Z", td: 1 }),
              entry({ sequence: 5, time: "2026-10-26T11:00:00Z", td: 2 }),
              entry({ sequence: 9, time: "2026-10-26T09:00:00Z", td: 3 }),
            ],
          },
          secondhalf: {
            score: 0,
            entries: [entry({ sequence: 2, td: 4 }), entry({ sequence: 8, td: 5 })],
          },
        }),
      }),
    );

    // Two timed rows first (newest first), then the untimed second-half rows by
    // sequence, then the untimed first-half row.
    expect(rows.map((entryRow) => entryRow.sequence)).toEqual([5, 1, 9, 8, 2]);
  });
});

describe("describeRow", () => {
  it("labels every scoring event", () => {
    expect(describeRow(row({ event: "Touchdown", player: 23 }))).toEqual({
      kind: "td",
      primary: "Touchdown Ravens",
      secondary: "#23",
    });
    expect(describeRow(row({ event: "1-Extra-Punkt" }))).toEqual({
      kind: "pat",
      primary: "1 Extrapunkt Ravens",
      secondary: null,
    });
    expect(describeRow(row({ event: "2-Extra-Punkte", player: 3 }))).toEqual({
      kind: "pat",
      primary: "2 Extrapunkte Ravens",
      secondary: "#3",
    });
    expect(describeRow(row({ event: "Overtime" }))).toEqual({
      kind: "pat",
      primary: "Overtime Ravens",
      secondary: null,
    });
    expect(describeRow(row({ event: "Turnover" }))).toMatchObject({
      kind: "int",
      primary: "Turnover Ravens",
    });
    expect(describeRow(row({ event: "Interception", player: 4 }))).toEqual({
      kind: "int",
      primary: "Interception Ravens",
      secondary: "#4",
    });
    expect(describeRow(row({ event: "First Down" }))).toEqual({
      kind: "first",
      primary: "1st Down Ravens",
      secondary: null,
    });
  });

  it("spells out the safety points and leaves a plain safety without them", () => {
    expect(
      describeRow(row({ event: "Safety (+1)", player: 7 })).secondary,
    ).toBe("+1 Punkt · #7");
    expect(describeRow(row({ event: "Safety (+2)" })).secondary).toBe(
      "+2 Punkte",
    );
    expect(describeRow(row({ event: "Safety" })).secondary).toBeNull();
  });

  it("labels penalties, timeouts, time and notes", () => {
    expect(
      describeRow(row({ event: "Strafe", input: "Holding", player: 9 })),
    ).toEqual({
      kind: "pen",
      primary: "Strafe gegen Ravens",
      secondary: "Holding · #9",
    });
    expect(describeRow(row({ event: "Strafe" }))).toEqual({
      kind: "pen",
      primary: "Strafe gegen Ravens",
      secondary: null,
    });
    expect(describeRow(row({ event: "Auszeit", input: "30" }))).toEqual({
      kind: "to",
      primary: "Auszeit Ravens",
      secondary: "30",
    });
    expect(describeRow(row({ event: "Spielzeit", input: "05:30" }))).toEqual({
      kind: "time",
      primary: "Spielzeit 05:30",
      secondary: null,
    });
    expect(describeRow(row({ event: "Spielzeit" })).primary).toBe("Spielzeit");
    expect(describeRow(row({ event: "Kickoff", input: "Verschoben" }))).toEqual({
      kind: "note",
      primary: "Kickoff",
      secondary: "Verschoben",
    });
  });

  it("uses a dash for a game-level marker without a team", () => {
    expect(describeRow(row({ event: "Spiel beendet", team: null })).primary).toBe(
      "Spiel beendet",
    );
    expect(
      describeRow(row({ event: "Touchdown", team: null })).primary,
    ).toBe("Touchdown –");
  });
});

describe("undoBody and isMarker", () => {
  it("undoes a scoring play by its sequence", () => {
    expect(undoBody(row({ event: "Touchdown", sequence: 4 }))).toEqual({
      sequence: 4,
    });
  });

  it("undoes an excluded event or a sequence-0 row by its row id", () => {
    expect(undoBody(row({ event: "Strafe", sequence: 7 }))).toEqual({
      team_log_id: 1,
    });
    expect(undoBody(row({ event: "Kickoff", sequence: 0 }))).toEqual({
      team_log_id: 1,
    });
  });

  it("falls back to the sequence for a reconstructed row", () => {
    expect(undoBody(row({ event: "Strafe", teamLogId: null }))).toEqual({
      sequence: 1,
    });
  });

  it("marks only the game-level markers", () => {
    for (const eventName of [
      "Spiel gestartet",
      "2. Halbzeit gestartet",
      "Spiel beendet",
    ]) {
      expect(isMarker(row({ event: eventName }))).toBe(true);
    }
    expect(isMarker(row({ event: "First Down" }))).toBe(false);
  });
});

describe("formatLogTime", () => {
  it("formats an ISO time and hides an absent or broken one", () => {
    expect(formatLogTime(null)).toBe("");
    expect(formatLogTime("keine Zeit")).toBe("");
    expect(formatLogTime("2026-10-26T12:05:00Z")).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("EventLog", () => {
  it("marks an entry that has not reached the server yet as waiting", () => {
    render(
      <EventLog
        onUndo={vi.fn()}
        rows={[
          row({ key: "local", teamLogId: -1, event: "First Down" }),
          row({ key: "sent", teamLogId: 9, event: "Turnover" }),
        ]}
      />,
    );

    const [local, sent] = screen.getAllByRole("listitem");
    expect(local).toHaveTextContent("wartet");
    expect(sent).not.toHaveTextContent("wartet");
  });


  it("says so when the log is empty and shows an undo error", () => {
    render(
      <EventLog
        error="Rückgängig fehlgeschlagen."
        onUndo={vi.fn()}
        rows={[]}
      />,
    );

    expect(screen.getByText("Noch keine Einträge")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Rückgängig fehlgeschlagen.",
    );
    expect(screen.getByText("0 Einträge")).toBeInTheDocument();
  });

  it("renders a row with its time and hands the undo the row", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    const only = row({ event: "Touchdown", player: 23 });
    render(<EventLog onUndo={onUndo} rows={[only]} />);

    expect(screen.getByText("Touchdown Ravens")).toBeInTheDocument();
    expect(screen.getByText("#23")).toBeInTheDocument();
    expect(screen.getByText("1 Einträge")).toBeInTheDocument();
    const time = document.querySelector("time");
    expect(time).toHaveAttribute("dateTime", "2026-10-26T12:00:00Z");

    await user.click(
      screen.getByRole("button", { name: "Rückgängig: Touchdown Ravens" }),
    );

    expect(onUndo).toHaveBeenCalledWith(only);
  });

  it("shows the undo as an icon with a tooltip, not a label", () => {
    render(<EventLog onUndo={vi.fn()} rows={[row({ event: "Touchdown" })]} />);

    const undo = screen.getByRole("button", {
      name: "Rückgängig: Touchdown Ravens",
    });
    expect(undo).toHaveTextContent(/^$/);
    expect(undo).toHaveAttribute("title", "Rückgängig: Touchdown Ravens");
  });

  it("strikes a deleted row and offers no undo for it", () => {
    render(
      <EventLog
        onUndo={vi.fn()}
        rows={[row({ event: "Touchdown", isDeleted: true })]}
      />,
    );

    expect(screen.getByText("gelöscht")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Rückgängig/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a marker but never offers its undo", () => {
    render(<EventLog onUndo={vi.fn()} rows={[row({ event: "Spiel beendet" })]} />);

    expect(screen.getByText("Spiel beendet")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Rückgängig/ }),
    ).not.toBeInTheDocument();
  });

  it("disables every undo while another write runs", () => {
    render(
      <EventLog
        disabled
        onUndo={vi.fn()}
        rows={[row({ event: "Touchdown" }), row({ key: "e2", event: "Strafe" })]}
      />,
    );

    for (const button of screen.getAllByRole("button", { name: /Rückgängig/ })) {
      expect(button).toBeDisabled();
    }
  });

  it("disables every undo while one row's undo is in flight", () => {
    render(
      <EventLog
        onUndo={vi.fn()}
        rows={[row({ event: "Touchdown" }), row({ key: "e2", event: "Strafe" })]}
        undoKey="e1"
      />,
    );

    const buttons = screen.getAllByRole("button", { name: /Rückgängig/ });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toBeDisabled();
    }
  });

  it("renders a row without a stored time as an empty time", () => {
    render(<EventLog onUndo={vi.fn()} rows={[row({ time: null })]} />);

    const time = document.querySelector("time");
    expect(time).not.toHaveAttribute("dateTime");
    expect(time).toHaveTextContent("");
  });

  it("hides the detail line of a row without one", () => {
    render(
      <EventLog
        onUndo={vi.fn()}
        rows={[row({ event: "Spielzeit", input: null })]}
      />,
    );

    const item = screen.getByRole("listitem");
    expect(within(item).queryByText(/·/)).not.toBeInTheDocument();
  });
});
