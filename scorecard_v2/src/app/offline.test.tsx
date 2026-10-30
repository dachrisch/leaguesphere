// Offline boot from the preload, a queued write that survives a remount, and
// the flush when the network comes back.
import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import App from "../App";
import { ApiError, apiGet, apiPost } from "../api/client";
import type { Gameday, Game, GameLog, GameLogTeam } from "../api/types";
import {
  resetSnapshotStore,
  removeSnapshot,
  snapshotKey,
  writeSnapshot,
} from "../offline/snapshot";
import { getRuntime, resetRuntime } from "../session/runtime";

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

const apiGetMock = apiGet as unknown as Mock;
const apiPostMock = apiPost as unknown as Mock;

const GAMEDAY: Gameday = {
  id: 1,
  name: "Herbsttag",
  season: 1,
  league: 2,
  league_display: "Landesliga",
  date: "2026-10-26",
  start: "10:00",
  format: "6_2",
  author: 1,
  address: "Sportplatz Nord",
  status: "IN_PROGRESS",
  published_at: null,
  updated_at: "2026-10-26T08:00:00Z",
  resource_urls: [],
};

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
  points_home: 0,
  points_away: 0,
  status: "1. Halbzeit",
  id_home: "11",
  id_away: "12",
  passcheck: true,
};

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

const SNAPSHOT_LOG: GameLog = {
  gameId: 42,
  isFirstHalf: true,
  inPossession: "Ravens",
  events: [],
  home: team(),
  away: team({ id: 2, name: "Wolves" }),
};

/** What the server answers once the queued first down lands. */
const SERVER_LOG: GameLog = {
  ...SNAPSHOT_LOG,
  events: [
    {
      id: 99,
      sequence: 1,
      team: "Ravens",
      event: "First Down",
      player: null,
      input: null,
      half: 1,
      cop: false,
      isDeleted: false,
      time: "2026-10-26T12:00:00Z",
    },
  ],
};

let online = false;

async function openGame(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  await user.click(await screen.findByRole("button", { name: /Herbsttag/ }));
  await user.click(
    await screen.findByRole("button", { name: /Ravens gegen Wolves/ }),
  );
  await screen.findByRole("heading", { name: "Feld 2 · Vorrunde" });
}

beforeEach(async () => {
  online = false;
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.spyOn(globalThis.navigator, "onLine", "get").mockImplementation(
    () => online,
  );
  resetRuntime();
  resetSnapshotStore();
  apiGetMock.mockReset();
  apiPostMock.mockReset();
  // Not a single request may succeed until the network is back.
  apiGetMock.mockRejectedValue(new ApiError(0, null, "Keine Verbindung"));
  apiPostMock.mockRejectedValue(new ApiError(0, null, "Keine Verbindung"));

  // The preload a previous online session left behind.
  await writeSnapshot(snapshotKey.gamedays(), [GAMEDAY]);
  await writeSnapshot(snapshotKey.games(1), { team: "crew", games: [GAME] });
  await writeSnapshot(snapshotKey.log(42), SNAPSHOT_LOG);
  await writeSnapshot(snapshotKey.roster(42), []);
  await writeSnapshot(snapshotKey.setup(42), {
    ctResult: "home",
    fhPossession: "home",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("offline capture", () => {
  it("boots from the snapshot, queues an event and flushes it on reconnect", async () => {
    const user = userEvent.setup();
    const first = render(<App />);

    // Boot offline: gameday and game list come from IndexedDB, not the API.
    await openGame(user);
    expect(apiGetMock.mock.calls.map((call) => call[0])).not.toContain(
      "/api/gameday/1/officials/crew",
    );

    // The log is the snapshot; the event is queued without a request.
    await user.click(screen.getByRole("button", { name: "1st Down" }));

    await waitFor(async () => {
      const pending = await getRuntime().outbox.pending(42);
      expect(pending).toHaveLength(1);
      expect(pending[0].kind).toBe("event");
      // The queue holds the event, not the sheet's play description.
      expect(pending[0].payload).toEqual({
        events: [
          {
            type: "series",
            code: "first_down",
            side: "home",
            player: null,
            period: 1,
          },
        ],
      });
      expect(pending[0].deviceId).toBeTruthy();
    });
    expect(apiPostMock).not.toHaveBeenCalled();
    expect(await screen.findByText("1st Down Ravens")).toBeInTheDocument();
    expect(await screen.findByText("Offline · 1")).toBeInTheDocument();

    // A fresh tab has no memory: the queue and the snapshot rebuild the view.
    first.unmount();
    render(<App />);
    await openGame(user);
    expect(await screen.findByText("1st Down Ravens")).toBeInTheDocument();

    // The network is back: the queue drains and the server log wins.
    const clientId = (await getRuntime().outbox.pending(42))[0].id;
    online = true;
    apiPostMock.mockImplementation(() => Promise.resolve({ state: {}, cursor: 1 }));
    // The append answers `{state, cursor}`; the log is read after it.
    apiGetMock.mockImplementation((path: string) =>
      path === "/api/gamelog/42"
        ? Promise.resolve(SERVER_LOG)
        : Promise.reject(new ApiError(500, null, "Server weg")),
    );
    await getRuntime().sync.resume();

    await waitFor(async () => {
      await expect(getRuntime().outbox.pending(42)).resolves.toEqual([]);
    });
    expect(apiPostMock).toHaveBeenCalledWith(
      "/api/game/42/events",
      {
        events: [
          {
            type: "series",
            code: "first_down",
            side: "home",
            player: null,
            period: 1,
          },
        ],
        client_id: clientId,
      },
      expect.objectContaining({ deviceId: expect.any(String) }),
    );
    await waitFor(() =>
      expect(screen.getByText("Synchron")).toBeInTheDocument(),
    );
    // The optimistic row was replaced by the server's row, not duplicated.
    expect(screen.getAllByText("1st Down Ravens")).toHaveLength(1);
  });

  it("shows stored data as stored, not as live", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Herbsttag/ }));

    // The games list came from IndexedDB: the official can tell the list is not
    // the server's current answer.
    expect(
      await screen.findByText(/Zwischengespeichert · \d{2}:\d{2}/),
    ).toBeInTheDocument();
  });

  it("boots a finished game as finished and does not reopen it", async () => {
    // What the finalise handler leaves behind: the game is `beendet` in the
    // games snapshot and the log/setup preload is gone.
    await writeSnapshot(snapshotKey.games(1), {
      team: "crew",
      games: [{ ...GAME, status: "beendet", points_home: 7, points_away: 0 }],
    });
    await removeSnapshot(snapshotKey.log(42));
    await removeSnapshot(snapshotKey.setup(42));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Herbsttag/ }));

    const pair = await screen.findByText("Ravens – Wolves");
    const row = pair.closest(".game-row");
    // A finished game is not a button: there is no way back into tracking (the
    // server would reject every write with `Dieses Spiel ist beendet.`).
    expect(pair.closest("button")).toBeNull();
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("beendet")).toBeInTheDocument();
  });

  it("shows the queue on the finalise screen and lets a rejected write go", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openGame(user);

    await user.click(screen.getByRole("button", { name: "1st Down" }));
    await waitFor(async () =>
      expect(await getRuntime().outbox.pending(42)).toHaveLength(1),
    );

    await user.click(
      screen.getByRole("button", { name: "Spiel beenden" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Spielende" }),
    ).toBeInTheDocument();
    // The badge is the way out of the guard: it names the unsent write and the
    // result cannot be sent.
    expect(screen.getByRole("button", { name: /Offline · 1/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ergebnis abschicken" }),
    ).toBeDisabled();

    // The server rejects the entry while the official is on this screen.
    const [pending] = await getRuntime().outbox.pending(42);
    await getRuntime().outbox.markFailed(pending.id, "Eintrag ungültig.");
    await getRuntime().sync.flush(42);

    // The badge lists the rejected entry; the guard above names it too.
    expect(
      (await screen.findAllByText("1 Eintrag abgelehnt")).length,
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Verwerfen" }));

    await waitFor(async () =>
      expect(await getRuntime().outbox.failed(42)).toEqual([]),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Verwerfen" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("keeps the undo of an unsynced event local", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openGame(user);

    await user.click(screen.getByRole("button", { name: "1st Down" }));
    await waitFor(() =>
      expect(screen.getByText("1st Down Ravens")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: /Rückgängig: 1st Down Ravens/ }),
    );

    await waitFor(async () => {
      await expect(getRuntime().outbox.pending(42)).resolves.toEqual([]);
    });
    expect(screen.queryByText("1st Down Ravens")).not.toBeInTheDocument();
    // Neither a POST nor a DELETE ever left the device.
    expect(apiPostMock).not.toHaveBeenCalled();
  });
});
