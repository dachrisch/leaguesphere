import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "../api/client";
import type {
  Game,
  GameLog,
  GameLogEvent,
  GameLogEventInput,
  GameLogTeam,
  LogEntry,
  Penalty,
  RosterPlayer,
} from "../api/types";
import TrackingScreen, { describeSaved, flipsPossession, writeTeam } from "./Tracking";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiPut: vi.fn(),
    apiDelete: vi.fn(),
  };
});

const apiPutMock = apiPut as unknown as Mock;
const apiDeleteMock = apiDelete as unknown as Mock;
const apiGetMock = apiGet as unknown as Mock;
const apiPostMock = apiPost as unknown as Mock;

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
  points_home: null,
  points_away: null,
  status: "1. Halbzeit",
  id_home: "11",
  id_away: "12",
  passcheck: true,
};

/** Local wall-clock time as ISO, so `formatLogTime` is timezone-independent. */
function isoAt(hour: number, minute: number): string {
  return new Date(2026, 9, 26, hour, minute).toISOString();
}

interface EventOverrides {
  id?: number;
  sequence?: number;
  team?: string | null;
  event?: string;
  player?: number | null;
  input?: string | null;
  half?: number;
  cop?: boolean;
  isDeleted?: boolean;
  time?: string;
}

function logEvent(overrides: EventOverrides = {}): GameLogEvent {
  return {
    id: 1,
    sequence: 1,
    team: "Ravens",
    event: "Touchdown",
    player: null,
    input: null,
    half: 1,
    cop: false,
    isDeleted: false,
    time: isoAt(12, 0),
    ...overrides,
  };
}

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

interface LogOverrides {
  isFirstHalf?: boolean;
  inPossession?: string | null;
  home?: GameLogTeam;
  away?: GameLogTeam;
  events?: GameLogEvent[];
  /** Omit `events` entirely to imitate a server that predates the addition. */
  withoutEvents?: boolean;
}

function makeLog(overrides: LogOverrides = {}): GameLog {
  return {
    gameId: 42,
    isFirstHalf: overrides.isFirstHalf ?? true,
    inPossession: overrides.inPossession ?? null,
    ...(overrides.withoutEvents === true
      ? {}
      : { events: overrides.events ?? [] }),
    home: overrides.home ?? team(),
    away:
      overrides.away ??
      team({ id: 2, name: "Wolves", score: 0 }),
  };
}

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return { sequence: 1, time: isoAt(12, 0), ...overrides };
}

async function clickUndo(name: RegExp): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name }));
}

beforeEach(() => {
  apiPutMock.mockReset();
  apiDeleteMock.mockReset();
  apiPostMock.mockReset();
  apiGetMock.mockReset();
  apiPutMock.mockResolvedValue(undefined);
  apiPostMock.mockResolvedValue(makeLog());
  // The roster request only matters for the entry sheets; a pending promise
  // keeps the unrelated tests free of state updates after they finished.
  apiGetMock.mockReturnValue(new Promise(() => undefined));
});

describe("Tracking score header", () => {
  it("shows both teams, the big score, possession and the half", () => {
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({
          isFirstHalf: false,
          inPossession: "Ravens",
          home: team({ score: 20 }),
          away: team({ id: 2, name: "Wolves", score: 7 }),
        })}
        onFinalize={vi.fn()}
      />,
    );

    const board = screen.getByLabelText("Spielstand");
    expect(within(board).getByText("20")).toBeInTheDocument();
    expect(within(board).getByText("7")).toBeInTheDocument();
    expect(within(board).getByText("am Ball")).toBeInTheDocument();
    expect(within(board).getByText("2. Halbzeit")).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /^Ravens, 20 Punkte, am Ball/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /^Wolves, 7 Punkte, nicht am Ball/ }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("derives the half from the payload instead of defaulting to the first", () => {
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({ isFirstHalf: false })}
        onFinalize={vi.fn()}
      />,
    );

    expect(screen.getByText("2. Halbzeit")).toBeInTheDocument();
    expect(screen.queryByText("1. Halbzeit")).not.toBeInTheDocument();
  });

  it("shows no possession marker when the payload has none", () => {
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({ inPossession: null })}
        onFinalize={vi.fn()}
      />,
    );

    expect(screen.queryByText("am Ball")).not.toBeInTheDocument();
  });
});

describe("Tracking possession", () => {
  it("sends the team name and switches the marker optimistically", async () => {
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({ inPossession: "Ravens" })}
        onFinalize={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^Wolves/ }));

    expect(apiPutMock).toHaveBeenCalledWith("/api/game/42/possession", {
      team: "Wolves",
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^Wolves/ }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
  });

  it("sends only one possession change for two rapid taps", () => {
    apiPutMock.mockReturnValue(new Promise(() => undefined));
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({ inPossession: "Ravens" })}
        onFinalize={vi.fn()}
      />,
    );

    const wolves = screen.getByRole("button", { name: /^Wolves/ });
    fireEvent.click(wolves);
    fireEvent.click(wolves);

    expect(apiPutMock).toHaveBeenCalledTimes(1);
    expect(wolves).toBeDisabled();
  });

  it("rolls the marker back when the request fails", async () => {
    apiPutMock.mockRejectedValueOnce(
      new ApiError(500, { detail: "Server weg" }, "Server weg"),
    );
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({ inPossession: "Ravens" })}
        onFinalize={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^Wolves/ }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Server weg"),
    );
    expect(screen.getByRole("button", { name: /^Wolves/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: /^Ravens/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("Tracking event log", () => {
  it("renders every event kind with its detail", () => {
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({
          events: [
            logEvent({ id: 1, event: "Spielzeit", input: "12:34", time: isoAt(12, 34) }),
            logEvent({ id: 2, event: "Auszeit", team: "Wolves", input: "1:30" }),
            logEvent({ id: 3, event: "Safety (+1)", player: 7 }),
            logEvent({ id: 4, event: "First Down" }),
            logEvent({ id: 5, event: "Interception", cop: true }),
            logEvent({ id: 6, event: "Strafe", team: "Wolves", input: "Holding Defense" }),
            logEvent({ id: 7, event: "1-Extra-Punkt", player: 7 }),
            logEvent({ id: 8, event: "Touchdown", player: 23 }),
          ],
        })}
        onFinalize={vi.fn()}
      />,
    );

    expect(screen.getByText("Spielzeit 12:34")).toBeInTheDocument();
    expect(screen.getByText("Auszeit Wolves")).toBeInTheDocument();
    expect(screen.getByText("Safety · Ravens")).toBeInTheDocument();
    expect(screen.getByText("+1 Punkt")).toBeInTheDocument();
    expect(screen.getByText("1st Down Ravens")).toBeInTheDocument();
    expect(screen.getByText("Interception Ravens")).toBeInTheDocument();
    expect(screen.getByText("Strafe gegen Wolves")).toBeInTheDocument();
    expect(screen.getByText("Holding Defense")).toBeInTheDocument();
    expect(screen.getByText("1 Extrapunkt Ravens")).toBeInTheDocument();
    expect(screen.getByText("Touchdown Ravens")).toBeInTheDocument();
    expect(screen.getByText("#23")).toBeInTheDocument();

    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Spielzeit 12:34");
    expect(rows[0]).toHaveTextContent("12:34");
    expect(rows[rows.length - 1]).toHaveTextContent("Touchdown Ravens");
  });

  it("passes the server's event order through unchanged", () => {
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({
          events: [
            logEvent({ id: 1, event: "Touchdown", time: isoAt(12, 5) }),
            logEvent({
              id: 9,
              event: "First Down",
              time: isoAt(12, 30),
            }),
          ],
        })}
        onFinalize={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Touchdown Ravens");
    expect(rows[1]).toHaveTextContent("1st Down Ravens");
  });

  it("keeps a deleted row visible, struck through and without undo", () => {
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({
          events: [
            logEvent({ id: 1, event: "Strafe", team: "Wolves", isDeleted: true }),
            logEvent({ id: 2, event: "Touchdown" }),
          ],
        })}
        onFinalize={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveClass("deleted");
    expect(
      within(rows[0]).queryByRole("button", { name: /Rückgängig/ }),
    ).not.toBeInTheDocument();
    expect(within(rows[1]).getByRole("button", { name: /Rückgängig/ })).toBeInTheDocument();
  });

  it("does not render an empty detail line for an empty input", () => {
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({
          events: [
            logEvent({
              id: 1,
              sequence: 0,
              event: "Auszeit",
              input: "",
            }),
          ],
        })}
        onFinalize={vi.fn()}
      />,
    );

    const row = screen.getAllByRole("listitem")[0];
    expect(row.querySelector(".rowsub")).toBeNull();
  });

  it("shows the empty state when there is nothing to log", () => {
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({ events: [] })}
        onFinalize={vi.fn()}
      />,
    );

    expect(screen.getByText("Noch keine Einträge")).toBeInTheDocument();
  });

  it("falls back to the scoring entries of an older server", () => {
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({
          withoutEvents: true,
          home: team({
            score: 7,
            firsthalf: { score: 7, entries: [entry({ sequence: 4, td: 23, pat1: 7 })] },
          }),
        })}
        onFinalize={vi.fn()}
      />,
    );

    expect(screen.getByText("Touchdown Ravens")).toBeInTheDocument();
    expect(screen.getByText("1 Extrapunkt Ravens")).toBeInTheDocument();
  });
});

describe("Tracking undo", () => {
  it("undoes a scoring play by sequence", async () => {
    apiDeleteMock.mockResolvedValue(makeLog());
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({
          events: [logEvent({ id: 5, sequence: 3, event: "Touchdown" })],
        })}
        onFinalize={vi.fn()}
      />,
    );

    await clickUndo(/Rückgängig: Touchdown Ravens/);

    expect(apiDeleteMock).toHaveBeenCalledWith("/api/gamelog/42", {
      sequence: 3,
    });
  });

  it("undoes an excluded event by team_log_id", async () => {
    apiDeleteMock.mockResolvedValue(makeLog());
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({
          events: [
            logEvent({
              id: 6,
              sequence: 0,
              event: "Strafe",
              team: "Wolves",
              input: "Holding Defense",
            }),
          ],
        })}
        onFinalize={vi.fn()}
      />,
    );

    await clickUndo(/Rückgängig: Strafe gegen Wolves/);

    expect(apiDeleteMock).toHaveBeenCalledWith("/api/gamelog/42", {
      team_log_id: 6,
    });
  });

  it("does not offer undo for a game marker", () => {
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({
          events: [
            logEvent({
              id: 9,
              sequence: 0,
              half: 0,
              team: null,
              event: "Spiel gestartet",
            }),
          ],
        })}
        onFinalize={vi.fn()}
      />,
    );

    expect(screen.getByText("Spiel gestartet")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Rückgängig/ }),
    ).not.toBeInTheDocument();
    expect(apiDeleteMock).not.toHaveBeenCalled();
  });

  it("undoes a change-of-possession play by sequence", async () => {
    apiDeleteMock.mockResolvedValue(makeLog());
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({
          events: [
            logEvent({
              id: 7,
              sequence: 6,
              event: "Turnover",
              cop: true,
            }),
          ],
        })}
        onFinalize={vi.fn()}
      />,
    );

    await clickUndo(/Rückgängig: Turnover Ravens/);

    expect(apiDeleteMock).toHaveBeenCalledWith("/api/gamelog/42", {
      sequence: 6,
    });
  });

  it("sends only one delete for two rapid undo taps", () => {
    apiDeleteMock.mockReturnValue(new Promise(() => undefined));
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({
          events: [
            logEvent({ id: 5, sequence: 2, event: "Touchdown" }),
            logEvent({ id: 6, sequence: 3, event: "Touchdown", player: 7 }),
          ],
        })}
        onFinalize={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: /Rückgängig/ });
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);

    expect(apiDeleteMock).toHaveBeenCalledTimes(1);
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
  });

  it("replaces the log with the delete response", async () => {
    apiDeleteMock.mockResolvedValue(
      makeLog({
        inPossession: "Wolves",
        home: team({ score: 14 }),
        away: team({ id: 2, name: "Wolves", score: 7 }),
        events: [
          logEvent({ id: 10, sequence: 0, event: "First Down", team: "Wolves" }),
          logEvent({ id: 5, sequence: 3, event: "Touchdown", isDeleted: true }),
        ],
      }),
    );
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({
          inPossession: "Ravens",
          home: team({ score: 20 }),
          away: team({ id: 2, name: "Wolves", score: 7 }),
          events: [logEvent({ id: 5, sequence: 3, event: "Touchdown" })],
        })}
        onFinalize={vi.fn()}
      />,
    );

    await clickUndo(/Rückgängig: Touchdown Ravens/);

    const board = screen.getByLabelText("Spielstand");
    await waitFor(() => expect(within(board).getByText("14")).toBeInTheDocument());
    expect(within(board).getByText("am Ball")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Wolves, 7 Punkte, am Ball/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("1st Down Wolves")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")[1]).toHaveClass("deleted");
  });

  it("does not adopt stale possession from a delete while a possession PUT is in flight", async () => {
    let resolvePut: (() => void) | undefined;
    apiPutMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePut = resolve;
      }),
    );
    apiDeleteMock.mockResolvedValue(
      makeLog({
        inPossession: "Ravens",
        events: [
          logEvent({ id: 5, sequence: 3, event: "Touchdown", isDeleted: true }),
        ],
      }),
    );
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({
          inPossession: "Ravens",
          events: [logEvent({ id: 5, sequence: 3, event: "Touchdown" })],
        })}
        onFinalize={vi.fn()}
      />,
    );

    const wolves = screen.getByRole("button", { name: /^Wolves/ });
    fireEvent.click(wolves);
    await clickUndo(/Rückgängig: Touchdown Ravens/);

    expect(wolves).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /^Ravens/ }),
    ).toHaveAttribute("aria-pressed", "false");

    await act(async () => {
      resolvePut?.();
    });
    expect(wolves).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the log and shows the server detail when undo fails", async () => {
    apiDeleteMock.mockRejectedValueOnce(
      new ApiError(403, { detail: "Keine Berechtigung." }, "Keine Berechtigung."),
    );
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog({
          events: [logEvent({ id: 5, sequence: 3, event: "Touchdown" })],
        })}
        onFinalize={vi.fn()}
      />,
    );

    await clickUndo(/Rückgängig: Touchdown Ravens/);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Keine Berechtigung."),
    );
    expect(screen.getByText("Touchdown Ravens")).toBeInTheDocument();
  });
});

describe("Tracking finalize", () => {
  it("hands the finalise flow to the caller", async () => {
    const onFinalize = vi.fn();
    render(
      <TrackingScreen
        game={GAME}
        initialLog={makeLog()}
        onFinalize={onFinalize}
      />,
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Spielende und Bestätigung" }),
    );

    expect(onFinalize).toHaveBeenCalledTimes(1);
  });
});

const ROSTER: RosterPlayer[] = [
  { side: "home", jersey: 7, name: "Meier" },
  { side: "home", jersey: 23, name: "Schulz" },
  { side: "away", jersey: 11, name: "Wolf" },
];

/** The penalty catalogue the sheet loads itself. */
const PENALTIES: Penalty[] = [
  { name: "Holding Defense", subtext: "BS/LoD 10", isPenaltyAgainstOpponent: true },
  { name: "Fehlstart", subtext: "DB/5", isPenaltyAgainstOpponent: false },
  { name: "Abschirmen (Blocken) Offense", subtext: "BS/5", isPenaltyAgainstOpponent: false },
];

/**
 * Route the GETs of one screen: the roster, the penalty catalogue and the log
 * reload after half-time. Unrouted paths fail loudly so a forgotten stub is a
 * test error instead of a silently pending promise.
 */
function routeGets(
  routes: {
    roster?: RosterPlayer[];
    penalties?: Penalty[];
    log?: GameLog;
  } = {},
): void {
  apiGetMock.mockImplementation((path: string) => {
    if (path === "/api/game/42/roster") {
      return Promise.resolve(routes.roster ?? ROSTER);
    }
    if (path === "/api/config/scorecard/penalties") {
      return Promise.resolve(routes.penalties ?? PENALTIES);
    }
    if (path === "/api/gamelog/42") {
      return Promise.resolve(routes.log ?? makeLog());
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

function renderTracking(
  overrides: { game?: Game; log?: GameLog } = {},
): void {
  render(
    <TrackingScreen
      game={overrides.game ?? GAME}
      initialLog={overrides.log ?? makeLog({ inPossession: "Ravens" })}
      onFinalize={vi.fn()}
    />,
  );
}

async function openSheet(
  user: ReturnType<typeof userEvent.setup>,
  name: string | RegExp,
): Promise<HTMLElement> {
  await user.click(screen.getByRole("button", { name }));
  return screen.findByRole("dialog");
}

async function pickJersey(
  user: ReturnType<typeof userEvent.setup>,
  jersey: number,
): Promise<void> {
  await user.click(
    await screen.findByRole("button", {
      name: new RegExp(`^Trikotnummer ${jersey}`),
    }),
  );
}

describe("Tracking touchdown entry", () => {
  it("loads the roster and offers only the possessing side's jerseys", async () => {
    apiGetMock.mockResolvedValue(ROSTER);
    renderTracking();
    const user = userEvent.setup();

    const dialog = await openSheet(user, /^Touchdown Ravens$/);

    expect(dialog).toHaveAccessibleName("Wer hat gepunktet?");
    expect(
      await screen.findByRole("button", { name: "Trikotnummer 23, Schulz" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Wolf/ }),
    ).not.toBeInTheDocument();
    expect(apiGetMock).toHaveBeenCalledWith("/api/game/42/roster");
  });

  it("posts the touchdown and replaces the log with the response", async () => {
    apiGetMock.mockResolvedValue(ROSTER);
    apiPostMock.mockResolvedValue(
      makeLog({
        inPossession: "Ravens",
        home: team({ score: 7, firsthalf: { score: 7, entries: [] } }),
        events: [
          logEvent({ id: 10, sequence: 1, event: "1-Extra-Punkt", player: 23 }),
          logEvent({ id: 9, sequence: 1, event: "Touchdown", player: 23 }),
        ],
      }),
    );
    renderTracking();
    const user = userEvent.setup();

    await openSheet(user, /^Touchdown Ravens$/);
    await pickJersey(user, 23);
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(apiPostMock).toHaveBeenCalledWith("/api/gamelog/42", {
      gameId: 42,
      team: "Ravens",
      half: 1,
      event: [
        { name: "Touchdown", player: 23 },
        { name: "1-Extra-Punkt", player: 23 },
      ],
    });

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const board = screen.getByLabelText("Spielstand");
    expect(within(board).getByText("7")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Touchdown gespeichert · #23",
    );
  });

  it("keeps the sheet open with the server detail when the write fails", async () => {
    apiGetMock.mockResolvedValue(ROSTER);
    apiPostMock.mockRejectedValue(
      new ApiError(
        409,
        { detail: "Dieses Spiel läuft auf einem anderen Gerät." },
        "Dieses Spiel läuft auf einem anderen Gerät.",
      ),
    );
    renderTracking();
    const user = userEvent.setup();

    await openSheet(user, /^Touchdown Ravens$/);
    await pickJersey(user, 23);
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dieses Spiel läuft auf einem anderen Gerät.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("disables the composer while a write is in flight", async () => {
    apiGetMock.mockResolvedValue(ROSTER);
    apiPostMock.mockReturnValue(new Promise(() => undefined));
    renderTracking();
    const user = userEvent.setup();

    await openSheet(user, /^Touchdown Ravens$/);
    await pickJersey(user, 23);
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(screen.getByRole("button", { name: /^Touchdown Ravens$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "1st Down" })).toBeDisabled();
  });
});

describe("Tracking series and time entry", () => {
  it("records the second half's Spielzeit with the payload half", async () => {
    apiPostMock.mockResolvedValue(makeLog({ inPossession: "Ravens" }));
    renderTracking({
      log: makeLog({ isFirstHalf: false, inPossession: "Ravens" }),
    });
    const user = userEvent.setup();

    const dialog = await openSheet(user, /^Spielzeit$/);
    expect(dialog).toHaveAccessibleName("Spielzeit");
    await user.type(screen.getByRole("textbox", { name: "Minuten" }), "12");
    await user.type(screen.getByRole("textbox", { name: "Sekunden" }), "34");
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(apiPostMock).toHaveBeenCalledWith("/api/gamelog/42", {
      gameId: 42,
      team: "Ravens",
      half: 2,
      event: [{ name: "Spielzeit", input: "12:34" }],
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Spielzeit gespeichert · 12:34",
    );
  });

  it("records an interception for the defender, not the passer", async () => {
    apiGetMock.mockResolvedValue(ROSTER);
    apiPostMock.mockResolvedValue(makeLog({ inPossession: "Ravens" }));
    renderTracking();
    const user = userEvent.setup();

    const dialog = await openSheet(user, /^Interception$/);
    expect(dialog).toHaveAccessibleName("Interception");
    expect(
      await screen.findByRole("button", { name: "Trikot 11, Wolf" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Trikot 23, Schulz" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Trikot 11, Wolf" }));
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(apiPostMock).toHaveBeenCalledWith("/api/gamelog/42", {
      gameId: 42,
      team: "Wolves",
      half: 1,
      event: [{ name: "Interception", player: 11 }],
    });
  });

  it("records a first down with an optional jersey", async () => {
    apiGetMock.mockResolvedValue(ROSTER);
    apiPostMock.mockResolvedValue(makeLog({ inPossession: "Ravens" }));
    renderTracking();
    const user = userEvent.setup();

    await openSheet(user, /^1st Down$/);
    await user.click(
      await screen.findByRole("button", { name: "Trikot 7, Meier" }),
    );
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(apiPostMock).toHaveBeenCalledWith("/api/gamelog/42", {
      gameId: 42,
      team: "Ravens",
      half: 1,
      event: [{ name: "First Down", player: 7 }],
    });
  });
});

describe("Tracking composer state", () => {
  it("disables the entry buttons for a finished game", () => {
    renderTracking({ game: { ...GAME, status: "beendet" } });

    expect(screen.getByRole("button", { name: /^Touchdown Ravens$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "1st Down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Strafe" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Safety" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Overtime" })).toBeDisabled();
    expect(screen.getByText("Dieses Spiel ist beendet.")).toBeInTheDocument();
  });

  it("asks for possession before an entry can be recorded", () => {
    renderTracking({ log: makeLog({ inPossession: null }) });

    expect(screen.getByRole("button", { name: /^Touchdown$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Turnover" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Strafe" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Safety" })).toBeDisabled();
    expect(
      screen.getByText("Ballbesitz wählen, um Einträge zu erfassen."),
    ).toBeInTheDocument();
  });

  it("shows the team name when possession is stored as a pk", () => {
    renderTracking({ log: makeLog({ inPossession: "1" }) });

    expect(
      screen.getByRole("button", { name: "Touchdown Ravens" }),
    ).toBeInTheDocument();
  });

  it("offers the penalty and more-event tiles as entries", () => {
    renderTracking();

    expect(screen.getByRole("button", { name: "Strafe" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Safety" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Overtime" })).toBeEnabled();
    expect(
      screen.queryByTitle("Folgt in einem späteren Schritt."),
    ).not.toBeInTheDocument();
  });
});

describe("Tracking write guard", () => {
  it("credits an interception to the opponent", () => {
    expect(
      writeTeam([{ name: "Interception", player: 11 }], "Ravens", "Wolves"),
    ).toBe("Wolves");
  });

  it("credits every other event to the possessing team", () => {
    expect(
      writeTeam(
        [
          { name: "Touchdown", player: 23 },
          { name: "1-Extra-Punkt", player: 23 },
        ],
        "Ravens",
        "Wolves",
      ),
    ).toBe("Ravens");
  });

  it("rejects a write without possession with a message", () => {
    expect(() =>
      writeTeam([{ name: "Touchdown", player: 23 }], null, "Wolves"),
    ).toThrow("Kein Ballbesitz – bitte Team wählen.");
  });
});

describe("Tracking entry lifecycle", () => {
  it("returns focus to the touchdown tile after a successful save", async () => {
    apiGetMock.mockResolvedValue(ROSTER);
    apiPostMock.mockResolvedValue(makeLog({ inPossession: "Ravens" }));
    renderTracking();
    const user = userEvent.setup();

    await openSheet(user, /^Touchdown Ravens$/);
    await pickJersey(user, 23);
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    // The touchdown hands the ball to Wolves, so the tile the official
    // returns to is Wolves' — same element, new label.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^Touchdown Wolves$/ }),
      ).toHaveFocus(),
    );
  });

  it("records a second touchdown after the first, for the new possession", async () => {
    apiGetMock.mockResolvedValue(ROSTER);
    apiPostMock.mockResolvedValue(makeLog({ inPossession: "Ravens" }));
    renderTracking();
    const user = userEvent.setup();

    await openSheet(user, /^Touchdown Ravens$/);
    await pickJersey(user, 23);
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(apiPutMock).toHaveBeenCalledWith("/api/game/42/possession", {
      team: "Wolves",
    });

    const tile = screen.getByRole("button", { name: /^Touchdown Wolves$/ });
    expect(tile).toBeEnabled();
    await user.click(tile);

    expect(
      screen.getByRole("button", { name: "Spieler wählen" }),
    ).toBeDisabled();
    await pickJersey(user, 11);
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledTimes(2));
    expect(apiPostMock).toHaveBeenLastCalledWith("/api/gamelog/42", {
      gameId: 42,
      team: "Wolves",
      half: 1,
      event: [
        { name: "Touchdown", player: 11 },
        { name: "1-Extra-Punkt", player: 11 },
      ],
    });
  });

  it("falls back to a typed number when the roster request fails", async () => {
    apiGetMock.mockRejectedValue(new ApiError(500, null, "Server weg"));
    apiPostMock.mockResolvedValue(makeLog({ inPossession: "Ravens" }));
    renderTracking();
    const user = userEvent.setup();

    await openSheet(user, /^Touchdown Ravens$/);
    const input = await screen.findByRole("textbox", { name: /Trikotnummer/ });
    await user.type(input, "51");
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(apiPostMock).toHaveBeenCalledWith("/api/gamelog/42", {
      gameId: 42,
      team: "Ravens",
      half: 1,
      event: [
        { name: "Touchdown", player: 51 },
        { name: "1-Extra-Punkt", player: 51 },
      ],
    });
  });

  it("disables the composer while a possession change is in flight", () => {
    apiPutMock.mockReturnValue(new Promise(() => undefined));
    renderTracking();

    fireEvent.click(screen.getByRole("button", { name: /^Wolves/ }));

    expect(
      screen.getByRole("button", { name: /^Touchdown Wolves$/ }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "1st Down" })).toBeDisabled();
  });
});

describe("Possession flip rule", () => {
  const FLIPS = [
    "Touchdown",
    "Turnover",
    "Interception",
    "Safety (+1)",
    "Safety (+2)",
    "Overtime",
  ];
  const KEEPS = ["Strafe", "Spielzeit", "Auszeit", "First Down"];

  it.each(FLIPS)("hands the ball over after %s", (name) => {
    expect(flipsPossession([{ name }])).toBe(true);
  });

  it.each(KEEPS)("keeps the ball after %s", (name) => {
    expect(flipsPossession([{ name }])).toBe(false);
  });

  it("treats a touchdown and its conversion as one play", () => {
    expect(
      flipsPossession([
        { name: "Touchdown", player: 23 },
        { name: "1-Extra-Punkt", player: 23 },
      ]),
    ).toBe(true);
  });
});

describe("Tracking possession flip", () => {
  it("flips to the other team after a touchdown and repaints the tile", async () => {
    apiGetMock.mockResolvedValue(ROSTER);
    apiPostMock.mockResolvedValue(makeLog({ inPossession: "Ravens" }));
    renderTracking();
    const user = userEvent.setup();

    await openSheet(user, /^Touchdown Ravens$/);
    await pickJersey(user, 23);
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(apiPutMock).toHaveBeenCalledWith("/api/game/42/possession", {
      team: "Wolves",
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^Touchdown Wolves$/ }),
      ).toHaveClass("tdbtn", "away"),
    );
  });

  it("does not flip after an Auszeit", async () => {
    apiPostMock.mockResolvedValue(makeLog({ inPossession: "Ravens" }));
    renderTracking();
    const user = userEvent.setup();

    await openSheet(user, /^Auszeit$/);
    await user.type(screen.getByRole("textbox", { name: "Minuten" }), "1");
    await user.type(screen.getByRole("textbox", { name: "Sekunden" }), "30");
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledTimes(1));
    expect(apiPutMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /^Touchdown Ravens$/ }),
    ).toBeInTheDocument();
  });

  it("keeps the ball after a first down and after a penalty", async () => {
    apiPostMock.mockResolvedValue(makeLog({ inPossession: "Ravens" }));
    routeGets();
    renderTracking();
    const user = userEvent.setup();

    await openSheet(user, /^1st Down$/);
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    await openSheet(user, /^Strafe$/);
    await user.click(
      await screen.findByRole("button", { name: /^Holding Defense/ }),
    );
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledTimes(2));
    expect(apiPutMock).not.toHaveBeenCalled();
  });

  it("flips exactly once per event", async () => {
    apiGetMock.mockResolvedValue(ROSTER);
    apiPostMock.mockResolvedValue(makeLog({ inPossession: "Ravens" }));
    renderTracking();
    const user = userEvent.setup();

    await openSheet(user, /^Turnover$/);
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    // The turnover credits the possessing team and hands Ravens' ball to
    // Wolves; the second turnover is recorded by Wolves and flips it back.
    await openSheet(user, /^Turnover$/);
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(apiPutMock).toHaveBeenCalledTimes(2));

    expect(apiPutMock.mock.calls[0][1]).toEqual({ team: "Wolves" });
    expect(apiPutMock.mock.calls[1][1]).toEqual({ team: "Ravens" });
    expect(
      screen.getByRole("button", { name: /^Touchdown Ravens$/ }),
    ).toBeInTheDocument();
  });

  it("keeps the log and shows the error when the flip fails", async () => {
    apiGetMock.mockResolvedValue(ROSTER);
    apiPostMock.mockResolvedValue(
      makeLog({
        inPossession: "Ravens",
        events: [
          logEvent({ id: 5, sequence: 1, event: "Touchdown", player: 23 }),
        ],
      }),
    );
    apiPutMock.mockRejectedValueOnce(
      new ApiError(500, { detail: "Ballbesitz nicht änderbar" }, "Ballbesitz nicht änderbar"),
    );
    renderTracking();
    const user = userEvent.setup();

    await openSheet(user, /^Touchdown Ravens$/);
    await pickJersey(user, 23);
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Ballbesitz nicht änderbar",
      ),
    );
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent(
      "Touchdown Ravens",
    );
    expect(
      screen.getByRole("button", { name: /^Touchdown Ravens$/ }),
    ).toBeInTheDocument();
  });

  it("shows the new possession while the flip is still in flight", async () => {
    apiGetMock.mockResolvedValue(ROSTER);
    apiPostMock.mockResolvedValue(makeLog({ inPossession: "Ravens" }));
    apiPutMock.mockReturnValue(new Promise(() => undefined));
    renderTracking();
    const user = userEvent.setup();

    await openSheet(user, /^Touchdown Ravens$/);
    await pickJersey(user, 23);
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    const tile = await screen.findByRole("button", {
      name: /^Touchdown Wolves$/,
    });
    expect(tile).toBeDisabled();
    expect(screen.getByRole("button", { name: "Strafe" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Safety" })).toBeDisabled();
  });
});

describe("Tracking penalties", () => {
  it("records the picked penalty for the team the flag names", async () => {
    routeGets();
    apiPostMock.mockResolvedValue(makeLog({ inPossession: "Ravens" }));
    renderTracking();
    const user = userEvent.setup();

    const dialog = await openSheet(user, /^Strafe$/);
    expect(dialog).toHaveAccessibleName("Strafe");
    await user.click(
      await screen.findByRole("button", { name: /^Holding Defense/ }),
    );
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(apiPostMock).toHaveBeenCalledWith("/api/gamelog/42", {
      gameId: 42,
      team: "Wolves",
      half: 1,
      event: [{ name: "Strafe", input: "Holding Defense" }],
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Strafe gespeichert · Holding Defense",
    );
  });
});

describe("Tracking safety and overtime", () => {
  it("records a safety for the opponent and hands them the ball", async () => {
    apiGetMock.mockResolvedValue(ROSTER);
    apiPostMock.mockResolvedValue(makeLog({ inPossession: "Ravens" }));
    renderTracking();
    const user = userEvent.setup();

    const dialog = await openSheet(user, /^Safety$/);
    expect(dialog).toHaveAccessibleName("Safety");
    expect(
      screen.queryByRole("button", { name: "Trikotnummer 23, Schulz" }),
    ).not.toBeInTheDocument();
    await user.click(
      await screen.findByRole("button", { name: "Trikotnummer 11, Wolf" }),
    );
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(apiPostMock).toHaveBeenCalledWith("/api/gamelog/42", {
      gameId: 42,
      team: "Wolves",
      half: 1,
      event: [{ name: "Safety (+2)", player: 11 }],
    });
    expect(apiPutMock).toHaveBeenCalledWith("/api/game/42/possession", {
      team: "Wolves",
    });
  });

  it("records an overtime with a jersey", async () => {
    apiGetMock.mockResolvedValue(ROSTER);
    apiPostMock.mockResolvedValue(makeLog({ inPossession: "Ravens" }));
    renderTracking();
    const user = userEvent.setup();

    await openSheet(user, /^Overtime$/);
    await user.click(
      await screen.findByRole("button", { name: "Trikotnummer 7, Meier" }),
    );
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(apiPostMock).toHaveBeenCalledWith("/api/gamelog/42", {
      gameId: 42,
      team: "Ravens",
      half: 1,
      event: [{ name: "Overtime", player: 7 }],
    });
  });
});

describe("Tracking half-time", () => {
  function markerLog(): GameLog {
    return makeLog({
      isFirstHalf: false,
      inPossession: "Wolves",
      events: [
        logEvent({
          id: 9,
          sequence: 0,
          half: 2,
          team: null,
          event: "2. Halbzeit gestartet",
        }),
      ],
    });
  }

  it("asks before it starts the half", async () => {
    renderTracking();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Halbzeit" }));

    expect(screen.getByText("Halbzeit starten?")).toBeInTheDocument();
    expect(apiPutMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByText("Halbzeit starten?")).not.toBeInTheDocument();
    expect(apiPutMock).not.toHaveBeenCalled();
  });

  it("writes the half-time, switches the half, flips possession and reloads the log", async () => {
    routeGets({ log: markerLog() });
    renderTracking();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Halbzeit" }));
    await user.click(screen.getByRole("button", { name: "Halbzeit starten" }));

    expect(apiPutMock).toHaveBeenCalledWith("/api/game/42/halftime", {});
    expect(apiPutMock).toHaveBeenCalledWith("/api/game/42/possession", {
      team: "Wolves",
    });
    await waitFor(() =>
      expect(screen.getByText("2. Halbzeit")).toBeInTheDocument(),
    );
    expect(apiGetMock).toHaveBeenCalledWith("/api/gamelog/42");
    expect(screen.getByText("2. Halbzeit gestartet")).toBeInTheDocument();
    // The second half has no half-time button any more.
    expect(screen.queryByRole("button", { name: "Halbzeit" })).toBeNull();
  });

  it("records the next entry in the second half for the new possession", async () => {
    routeGets({ log: markerLog() });
    apiPostMock.mockResolvedValue(markerLog());
    renderTracking();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Halbzeit" }));
    await user.click(screen.getByRole("button", { name: "Halbzeit starten" }));
    await waitFor(() =>
      expect(screen.getByText("2. Halbzeit")).toBeInTheDocument(),
    );

    await openSheet(user, /^1st Down$/);
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(apiPostMock).toHaveBeenCalledWith("/api/gamelog/42", {
      gameId: 42,
      team: "Wolves",
      half: 2,
      event: [{ name: "First Down" }],
    });
  });

  it("shows the server detail when the half-time transition is rejected", async () => {
    apiPutMock.mockRejectedValueOnce(
      new ApiError(
        409,
        { detail: "Dieser Spielstatus erlaubt keine Halbzeit." },
        "Dieser Spielstatus erlaubt keine Halbzeit.",
      ),
    );
    renderTracking();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Halbzeit" }));
    await user.click(screen.getByRole("button", { name: "Halbzeit starten" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Dieser Spielstatus erlaubt keine Halbzeit.",
      ),
    );
    expect(apiPutMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1. Halbzeit")).toBeInTheDocument();
  });

  it("keeps the composer closed while the half-time is being written", async () => {
    apiPutMock.mockReturnValue(new Promise(() => undefined));
    renderTracking();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Halbzeit" }));
    await user.click(screen.getByRole("button", { name: "Halbzeit starten" }));

    expect(screen.getByRole("button", { name: /^Touchdown Ravens$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "1st Down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Strafe" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Wolves/ })).toBeDisabled();
  });

  it("keeps the second half when the log reload fails", async () => {
    apiGetMock.mockImplementation((path: string) => {
      if (path === "/api/game/42/roster") {
        return Promise.resolve(ROSTER);
      }
      return Promise.reject(new ApiError(500, null, "Server weg"));
    });
    renderTracking();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Halbzeit" }));
    await user.click(screen.getByRole("button", { name: "Halbzeit starten" }));

    await waitFor(() =>
      expect(screen.getByText("2. Halbzeit")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /^Touchdown Wolves$/ }),
    ).toBeInTheDocument();
  });
});

describe("Tracking confirmation text", () => {
  it("names a penalty and its jersey", () => {
    const events: GameLogEventInput[] = [
      { name: "Strafe", player: 23, input: "Holding Defense" },
    ];
    expect(describeSaved(events)).toBe("Strafe gespeichert · Holding Defense");
  });

  it("names a safety", () => {
    expect(describeSaved([{ name: "Safety (+2)", player: 11 }])).toBe(
      "Safety gespeichert · #11",
    );
  });
});
