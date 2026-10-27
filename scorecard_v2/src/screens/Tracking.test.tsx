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
  GameLogTeam,
  LogEntry,
  RosterPlayer,
} from "../api/types";
import TrackingScreen from "./Tracking";

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

  it("records an interception for the possessing team", async () => {
    apiPostMock.mockResolvedValue(makeLog({ inPossession: "Wolves" }));
    renderTracking({ log: makeLog({ inPossession: "Wolves" }) });
    const user = userEvent.setup();

    await openSheet(user, /^Interception$/);
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(apiPostMock).toHaveBeenCalledWith("/api/gamelog/42", {
      gameId: 42,
      team: "Wolves",
      half: 1,
      event: [{ name: "Interception" }],
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
    expect(screen.getByText("Dieses Spiel ist beendet.")).toBeInTheDocument();
  });

  it("asks for possession before an entry can be recorded", () => {
    renderTracking({ log: makeLog({ inPossession: null }) });

    expect(screen.getByRole("button", { name: /^Touchdown$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Turnover" })).toBeDisabled();
    expect(
      screen.getByText("Ballbesitz wählen, um Einträge zu erfassen."),
    ).toBeInTheDocument();
  });

  it("renders the penalty and safety tiles disabled", () => {
    renderTracking();

    expect(screen.getByRole("button", { name: "Strafe" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Safety" })).toBeDisabled();
  });
});
