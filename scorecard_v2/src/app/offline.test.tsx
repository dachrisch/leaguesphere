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
  await screen.findByRole("heading", { name: "Spiel läuft" });
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
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Speichern",
      }),
    );

    await waitFor(async () => {
      const pending = await getRuntime().outbox.pending(42);
      expect(pending).toHaveLength(1);
      expect(pending[0].kind).toBe("event");
      expect(pending[0].payload).toEqual(
        expect.objectContaining({
          gameId: 42,
          team: "Ravens",
          half: 1,
          event: [{ name: "First Down" }],
        }),
      );
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
    apiPostMock.mockImplementation(() => Promise.resolve(SERVER_LOG));
    await getRuntime().sync.resume();

    await waitFor(async () => {
      await expect(getRuntime().outbox.pending(42)).resolves.toEqual([]);
    });
    expect(apiPostMock).toHaveBeenCalledWith(
      "/api/gamelog/42",
      expect.objectContaining({
        client_id: clientId,
        gameId: 42,
        team: "Ravens",
        half: 1,
        event: [{ name: "First Down" }],
      }),
      expect.objectContaining({ deviceId: expect.any(String) }),
    );
    await waitFor(() =>
      expect(screen.getByText("Synchron")).toBeInTheDocument(),
    );
    // The optimistic row was replaced by the server's row, not duplicated.
    expect(screen.getAllByText("1st Down Ravens")).toHaveLength(1);
  });

  it("keeps the undo of an unsynced event local", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openGame(user);

    await user.click(screen.getByRole("button", { name: "1st Down" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Speichern",
      }),
    );
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
