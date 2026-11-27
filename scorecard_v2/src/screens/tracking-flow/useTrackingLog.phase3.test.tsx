import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiGet } from "../../api/client";
import type { GameRules } from "../../api/rules";
import type { Game, GameLog, GameLogEvent, GameSetup, Official, RosterPlayer, TeamOfficial } from "../../api/types";
import { getRuntime } from "../../session/runtime";
import { useSyncStatus } from "../../session/useSyncStatus";
import { useTrackingLog } from "./useTrackingLog";
import type { LogRow } from "../../components/EventLog";

const h = vi.hoisted(() => ({
  status: {
    pending: 0,
    failed: 0,
    failedOps: [],
    pendingOps: [],
    syncing: false,
    paused: null as string | null,
    online: true,
    resume: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    drop: vi.fn(async () => undefined),
    refresh: vi.fn(),
  },
  paused: vi.fn((reason: string | null) =>
    reason === null ? null : `Grund ${reason}`,
  ),
  stranded: vi.fn(() => false),
  cachedGet: vi.fn((...args: unknown[]) => {
    void args;
    return Promise.resolve([] as unknown);
  }),
  cachedGetMeta: vi.fn((...args: unknown[]) => {
    void args;
    return Promise.resolve(null as unknown);
  }),
  readQuarterback: vi.fn((...args: unknown[]) => {
    void args;
    return null as unknown;
  }),
  rememberQuarterback: vi.fn(),
}));

vi.mock("../../session/useSyncStatus", () => ({
  useSyncStatus: vi.fn(() => h.status),
  pauseReason: h.paused,
}));
vi.mock("../../session/stranded", () => ({
  isStranded: h.stranded,
  strandedNotice: vi.fn(() => "gestrandet"),
}));
vi.mock("../../components/SyncBadge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../components/SyncBadge")>();
  return { ...actual, pauseReason: h.paused };
});
vi.mock("../../app/sideline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../app/sideline")>();
  return { ...actual, useWakeLock: vi.fn() };
});
vi.mock("../../session/runtime", () => ({
  getRuntime: vi.fn(() => ({ sync: { pause: vi.fn() } })),
}));
vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return { ...actual, apiGet: vi.fn() };
});
vi.mock("../../offline/snapshot", () => ({
  cachedGet: h.cachedGet,
  cachedGetMeta: h.cachedGetMeta,
  snapshotKey: {
    penalties: () => "penalties",
    rules: () => "rules",
    roster: (id: number) => `roster-${id}`,
    setup: (id: number) => `setup-${id}`,
    log: (id: number) => `log-${id}`,
  },
}));
vi.mock("../../device", () => ({ getDeviceId: vi.fn(() => "dev-1") }));
vi.mock("../../app/quarterback", () => ({
  readQuarterback: h.readQuarterback,
  rememberQuarterback: h.rememberQuarterback,
}));
vi.mock("../../session/ids", () => ({ newOpId: vi.fn(() => "op-1") }));

const statusMock = useSyncStatus as unknown as ReturnType<typeof vi.fn>;
const apiGetMock = apiGet as unknown as ReturnType<typeof vi.fn>;
const runtimeMock = getRuntime as unknown as ReturnType<typeof vi.fn>;

function logEvent(over: Partial<GameLogEvent> = {}): GameLogEvent {
  return {
    id: 1,
    sequence: 1,
    seq: null,
    team: "Ravens",
    event: "First Down",
    player: null,
    input: null,
    half: 1,
    cop: false,
    isDeleted: false,
    time: "2026-11-26T12:00:00Z",
    ...over,
  };
}

function team(name: string) {
  return {
    id: 1,
    name,
    score: 0,
    firsthalf: { score: 0, entries: [] },
    secondhalf: { score: 0, entries: [] },
  };
}

function makeLog(over: Partial<GameLog> = {}): GameLog {
  return {
    gameId: 42,
    isFirstHalf: true,
    inPossession: "Ravens",
    events: [],
    home: team("Ravens"),
    away: team("Wolves"),
    ...over,
  };
}

const game = (status = "2. Halbzeit"): Game =>
  ({ id: 42, status, home: "Ravens", away: "Wolves" }) as Game;

type Over = Parameters<typeof useTrackingLog>[0];

let subscribers: ((next: GameLog, source: string) => void)[] = [];

function makeSession(initial: GameLog = makeLog()) {
  let current = initial;
  const session = {
    subscribe: vi.fn((cb: (next: GameLog, source: string) => void) => {
      subscribers.push(cb);
      return () => {
        subscribers = subscribers.filter((item) => item !== cb);
      };
    }),
    getLog: vi.fn(() => current),
    getServerLog: vi.fn(() => makeLog({ home: team("Server") })),
    refresh: vi.fn(async () => (current = makeLog({ inPossession: "Wolves" }))),
    setPossession: vi.fn(async () => undefined),
    undo: vi.fn(async () => undefined),
    writeEvent: vi.fn(async () => undefined),
  };
  return { session, emit: (next: GameLog, source: string) => subscribers.forEach((cb) => cb(next, source)) };
}

function useHarness(over: Partial<Over>, initial: GameLog) {
  const [{ session, emit }] = useState(() => makeSession(initial));
  const [rules, setRules] = useState<GameRules | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[] | null>([]);
  const [setup, setSetup] = useState<GameSetup | null>(null);
  const [officials, setOfficials] = useState<Official[] | null>([]);
  const [officialsUnavailable, setOfficialsUnavailable] = useState(false);
  const [people, setPeople] = useState<TeamOfficial[]>([]);
  const [possession, setPossession] = useState<string | null>(initial.inPossession ?? null);
  const [possessionPending, setPossessionPending] = useState(false);
  const [possessionError, setPossessionError] = useState<string | null>(null);
  const [undoKey, setUndoKey] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LogRow | null>(null);
  const [posting, setPosting] = useState(false);
  const [halftimePending] = useState(false);
  const setupLoadRef = useRef<Promise<GameSetup | null | undefined> | null>(
    Promise.resolve(null),
  );
  const possessionInFlightRef = useRef(false);
  const undoInFlightRef = useRef(false);
  const postInFlightRef = useRef(false);
  const [closePat] = useState(() => vi.fn());
  const [reopenPat] = useState(() => vi.fn());
  const [disarm] = useState(() => vi.fn());
  // Spy on the setters the late async answers drive: after unmount the
  // `if (active)` guards must keep them untouched. The real setters still run
  // so the hook's own state stays observable before unmount.
  const [lateSetters] = useState(() => ({
    setRoster: vi.fn(setRoster),
    setSetup: vi.fn(setSetup),
    setOfficials: vi.fn(setOfficials),
    setPeople: vi.fn(setPeople),
  }));
  const args: Over = {
    game: game(),
    session: session as unknown as Over["session"],
    rules,
    setRules,
    setRoster: lateSetters.setRoster,
    setSetup: lateSetters.setSetup,
    setupLoadRef: setupLoadRef as unknown as Over["setupLoadRef"],
    setOfficials: lateSetters.setOfficials,
    setOfficialsUnavailable,
    setPeople: lateSetters.setPeople,
    possession,
    setPossession,
    setPossessionPending,
    setPossessionError,
    setUndoKey,
    setUndoError,
    editing,
    setEditing,
    setPosting,
    halftimePending,
    pendingPat: null,
    closePat,
    reopenPat,
    possessionInFlightRef,
    undoInFlightRef,
    postInFlightRef,
    disarm,
    ...over,
  };
  return {
    ...useTrackingLog(args),
    emit,
    session,
    closePat,
    reopenPat,
    disarm,
    lateSetters,
    refs: { possessionInFlightRef, undoInFlightRef, postInFlightRef },
    state: {
      possession,
      possessionError,
      possessionPending,
      undoKey,
      undoError,
      editing,
      posting,
      roster,
      setup,
      officials,
      officialsUnavailable,
      people,
    },
  };
}

function setup(over: Partial<Over> = {}, initial = makeLog()) {
  return renderHook(
    ({ o, log }: { o: Partial<Over>; log: GameLog }) => useHarness(o, log),
    { initialProps: { o: over, log: initial } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  subscribers = [];
  Object.assign(h.status, {
    pending: 0,
    paused: null,
    online: true,
    inPossession: "Ravens",
  });
  h.stranded.mockReturnValue(false);
  h.paused.mockImplementation((reason: string | null) =>
    reason === "device" ? "Grund device" : null,
  );
  h.cachedGet.mockImplementation(async (key?: unknown) => {
    void key;
    return [];
  });
  h.cachedGetMeta.mockImplementation(async (key?: unknown) => {
    void key;
    return null;
  });
  h.readQuarterback.mockImplementation((id?: unknown, side?: unknown) => {
    void id;
    void side;
    return null;
  });
  h.rememberQuarterback.mockClear();
  statusMock.mockReturnValue(h.status);
  apiGetMock.mockResolvedValue({ can_release_lock: true, locked_elsewhere: false });
  runtimeMock.mockReturnValue({ sync: { pause: vi.fn() } });
});

describe("useTrackingLog derivation (Phase 3 characterization)", () => {
  it("reads the log, geometry, timeouts and unsportsmanlike rows", async () => {
    const { result } = setup(
      {},
      makeLog({
        events: [
          logEvent({ id: 1, event: "Auszeit", team: "Ravens", input: "12:00" }),
          logEvent({ id: 2, event: "Auszeit", team: "Wolves", input: "11:50", isDeleted: true }),
          logEvent({ id: 3, event: "Strafe", team: "Ravens", input: "Unsportliches Verhalten" }),
        ],
      }),
    );
    await waitFor(() => expect(result.current.rows.length).toBe(3));
    expect(result.current.timeouts).toHaveLength(1);
    expect(result.current.timeouts[0]).toEqual({ team: "Ravens", half: 1, time: "12:00" });
    expect(result.current.unsportsmanlike).toEqual([
      { team: "Ravens", half: 1, text: "", numbers: [] },
    ]);
    expect(result.current.finished).toBe(false);
    expect(result.current.readOnly).toBe(false);
    expect(result.current.stopReason).toBeNull();
    expect(result.current.possessionSide).toBe("home");
    expect(result.current.opponentSide).toBe("away");
    expect(result.current.possessionName).toBe("Ravens");
    expect(result.current.opponentName).toBe("Wolves");
    expect(result.current.logTeamName(team("  "))).toBeNull();
    expect(result.current.logTeamName(team("Ravens"))).toBe("Ravens");
  });

  it("marks finished, stranded and read-only games", async () => {
    Object.assign(h.status, { paused: "device", pending: 2 });
    h.stranded.mockReturnValue(true);
    const { result } = setup({ game: game("beendet") });
    await waitFor(() => expect(result.current.finished).toBe(true));
    expect(result.current.stranded).toBe(true);
    expect(result.current.readOnly).toBe(true);
    expect(result.current.stopReason).toBe("Grund device");
    // The server log is the official score once this device is stranded.
    expect(result.current.officialLog.home.name).toBe("Server");

    cleanup();
    h.stranded.mockReturnValue(false);
    const local = setup({});
    expect(local.result.current.officialLog.home.name).toBe("Ravens");

    Object.assign(h.status, { paused: "auth" });
    const auth = setup({});
    expect(auth.result.current.readOnly).toBe(true);
    Object.assign(h.status, { paused: null });
  });

  it("adopts a server possession only on refresh and without an in-flight change", async () => {
    const { result } = setup();
    await act(async () => {
      result.current.emit(makeLog({ inPossession: "Wolves" }), "refresh");
    });
    expect(result.current.state.possession).toBe("Wolves");
    result.current.refs.possessionInFlightRef.current = true;
    await act(async () => {
      result.current.emit(makeLog({ inPossession: "Ravens" }), "refresh");
    });
    expect(result.current.state.possession).toBe("Wolves");
    await act(async () => {
      result.current.emit({ ...makeLog() } as GameLog, "write");
    });
    expect(result.current.state.possession).toBe("Wolves");
  });

  it("shows the drained strip when a paused queue drains", async () => {
    Object.assign(h.status, { pending: 2, paused: null });
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.drained).toBe(false));
    Object.assign(h.status, { pending: 0 });
    rerender({ o: {}, log: makeLog() });
    await waitFor(() => expect(result.current.drained).toBe(true));
    // A new pending write hides the strip again; a paused queue never shows it.
    Object.assign(h.status, { pending: 1 });
    rerender({ o: {}, log: makeLog() });
    await waitFor(() => expect(result.current.drained).toBe(false));
    Object.assign(h.status, { pending: 0, paused: "device" });
    rerender({ o: {}, log: makeLog() });
    expect(result.current.drained).toBe(false);
    Object.assign(h.status, { paused: null });
  });

  it("warms caches, seeds the quarterback, reads lock rights and crew", async () => {
    const pause = vi.fn();
    runtimeMock.mockReturnValue({ sync: { pause } });
    h.cachedGet.mockImplementation(async (key: unknown) => {
      if (key === "penalties") return ["Flag"] as unknown;
      if (key === "rules") throw new Error("offline");
      if (key === "roster-42") return [{ id: 1, name: "Seven" }];
      if (key === "officials:42") return [{ id: 3, name: "Ref" }];
      return [{ id: 4, name: "Directory" }];
    });
    h.cachedGetMeta.mockImplementation(async () => ({
      value: {
        qbHome: 7,
        qbAway: 9,
        locked_elsewhere: true,
        can_release_lock: true,
      },
      updatedAt: null,
    }));
    h.readQuarterback.mockImplementation((id?: unknown, side?: unknown) => {
      void id;
      void side;
      return null;
    });

    const { result } = setup({ game: game("1. Halbzeit") });
    await waitFor(() => expect(result.current.state.roster).toHaveLength(1));
    expect(result.current.state.setup?.qbHome).toBe(7);
    expect(h.rememberQuarterback).toHaveBeenCalledWith(42, "home", 7);
    expect(h.rememberQuarterback).toHaveBeenCalledWith(42, "away", 9);
    await waitFor(() => expect(pause).toHaveBeenCalledWith("device", 42));
    expect(result.current.state.officials).toEqual([{ id: 3, name: "Ref" }]);
    expect(result.current.state.officialsUnavailable).toBe(false);
    expect(result.current.state.people).toEqual([{ id: 4, name: "Directory" }]);

    cleanup();
    // Failed reads stay empty instead of throwing on mount.
    h.cachedGet.mockImplementation(async () => {
      throw new Error("offline");
    });
    h.cachedGetMeta.mockImplementation(async () => ({
      value: { locked_elsewhere: false, qbAway: 9 },
      updatedAt: "2026-11-26T12:00:00Z",
    }));
    h.readQuarterback.mockImplementation((id?: unknown, side?: unknown) => {
      void id;
      void side;
      return 5 as unknown;
    });
    const offline = setup();
    await waitFor(() =>
      expect(offline.result.current.state.officialsUnavailable).toBe(true),
    );
    expect(offline.result.current.state.roster).toEqual([]);
    expect(offline.result.current.state.officials).toBeNull();
    expect(offline.result.current.state.people).toEqual([]);
  });

  it("runs the drain timer and hides the strip again", async () => {
    Object.assign(h.status, { pending: 2, paused: null });
    const { result, rerender } = setup();
    Object.assign(h.status, { pending: 0 });
    rerender({ o: {}, log: makeLog() });
    await waitFor(() => expect(result.current.drained).toBe(true));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2600));
    });
    expect(result.current.drained).toBe(false);
  });

  it("uses a live lock answer and retries a 409 with no known lock rights", async () => {
    const pause = vi.fn();
    runtimeMock.mockReturnValue({ sync: { pause } });
    h.cachedGetMeta.mockResolvedValue({
      value: { locked_elsewhere: true, can_release_lock: true },
      updatedAt: null,
    });
    const { result } = setup();
    await waitFor(() => expect(pause).toHaveBeenCalledWith("device", 42));
    expect(result.current.state.setup).toBeTruthy();
    // A live lock answer grants the release right at hook level.
    expect(result.current.canRelease).toBe(true);

    cleanup();
    // A stored answer has no fresh lock: the 409 retry asks the server once.
    h.cachedGetMeta.mockImplementation(() => new Promise<unknown>(() => undefined));
    Object.assign(h.status, { paused: "device", pending: 1 });
    apiGetMock.mockResolvedValueOnce({
      locked_elsewhere: true,
      can_release_lock: true,
    });
    const retry = setup();
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(retry.result.current.canRelease).toBe(true));
    Object.assign(h.status, { paused: null });
  });

  it("ignores cache answers that arrive after unmount", async () => {
    let resolveRoster: (value: unknown) => void = () => undefined;
    let resolveSetup: (value: unknown) => void = () => undefined;
    let resolveCrew: (value: unknown) => void = () => undefined;
    h.cachedGet.mockImplementation((key: unknown) => {
      if (key === "roster-42")
        return new Promise<unknown>((resolve) => {
          resolveRoster = resolve;
        });
      if (key === "officials:42")
        return new Promise<unknown>((resolve) => {
          resolveCrew = resolve;
        });
      return Promise.resolve([]);
    });
    h.cachedGetMeta.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSetup = resolve;
        }),
    );
    const first = setup();
    first.unmount();
    await act(async () => {
      resolveRoster(null);
      resolveSetup({ value: { qbHome: 7 }, updatedAt: null });
      resolveCrew([{ id: 3, name: "Late ref" }]);
    });
    // Each late answer must be dropped, not written into unmounted state.
    expect(first.result.current.lateSetters.setRoster).not.toHaveBeenCalled();
    expect(first.result.current.lateSetters.setSetup).not.toHaveBeenCalled();
    expect(first.result.current.lateSetters.setOfficials).not.toHaveBeenCalled();

    // The same guard applies when a roster read fails after unmount.
    let failRoster: (error: Error) => void = () => undefined;
    h.cachedGet.mockImplementation((key: unknown) => {
      if (key === "roster-42")
        return new Promise<unknown>((_resolve, reject) => {
          failRoster = reject;
        });
      return Promise.resolve([]);
    });
    const second = setup();
    second.unmount();
    await act(async () => {
      failRoster(new Error("offline"));
    });
    expect(second.result.current.lateSetters.setRoster).not.toHaveBeenCalled();
  });

  it("handles a null roster, an unlocked answer, a failed setup read and a late 409 reply", async () => {
    h.cachedGet.mockImplementation((key: unknown) =>
      key === "roster-42" ? Promise.resolve(null) : Promise.resolve([]),
    );
    h.cachedGetMeta.mockRejectedValueOnce(new Error("offline"));
    const { result } = setup();
    await waitFor(() => expect(result.current.state.roster).toEqual([]));
    expect(result.current.state.setup).toBeNull();

    cleanup();
    h.cachedGetMeta.mockResolvedValue({
      value: { locked_elsewhere: false, can_release_lock: true },
      updatedAt: null,
    });
    const unlocked = setup();
    await waitFor(() => expect(unlocked.result.current.state.setup).toBeTruthy());

    cleanup();
    h.cachedGetMeta.mockImplementation(() => new Promise<unknown>(() => undefined));
    Object.assign(h.status, { paused: "device" });
    let resolveApi: (answer: unknown) => void = () => undefined;
    apiGetMock.mockImplementation(
      () =>
        new Promise<unknown>((resolve) => {
          resolveApi = resolve;
        }),
    );
    const late = setup();
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled());
    late.unmount();
    await act(async () => {
      resolveApi({ can_release_lock: true });
    });
    Object.assign(h.status, { paused: null });
  });

  it("asks the server for lock rights after a 409 the open read never saw", async () => {
    Object.assign(h.status, { paused: "device", pending: 1 });
    const { result } = setup();
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledWith(
      "/api/game/42/setup",
      { deviceId: "dev-1" },
    ));
    expect(result.current.state.setup).toBeNull();

    cleanup();
    apiGetMock.mockRejectedValueOnce(new Error("offline"));
    Object.assign(h.status, { paused: "device", pending: 1 });
    setup();
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledTimes(2));
  });
});

describe("useTrackingLog handlers (Phase 3 characterization)", () => {
  const row = (over: Partial<LogRow> = {}): LogRow =>
    ({
      key: "row-1",
      teamLogId: 5,
      eventSeq: 1,
      groupSequence: 1,
      team: "Ravens",
      event: "First Down",
      player: null,
      input: null,
      half: 1,
      cop: false,
      isDeleted: false,
      time: "2026-11-26T12:00:00Z",
      payload: null,
      ...over,
    }) as LogRow;

  it("re-syncs the marker, tolerating a missing field and a failed read", async () => {
    const { result } = setup();
    result.current.session.refresh.mockResolvedValueOnce(
      makeLog({ inPossession: "Wolves" }),
    );
    await act(async () => result.current.resyncPossession());
    expect(result.current.state.possession).toBe("Wolves");

    const fresh = makeLog();
    delete (fresh as unknown as Record<string, unknown>).inPossession;
    result.current.session.refresh.mockResolvedValueOnce(fresh);
    await act(async () => result.current.resyncPossession());
    expect(result.current.state.possession).toBe("Wolves");

    result.current.session.refresh.mockRejectedValueOnce(new Error("offline"));
    await act(async () => result.current.resyncPossession());
    expect(result.current.state.possession).toBe("Wolves");
  });

  it("changes possession optimistically and rolls back a rejected write", async () => {
    const { result } = setup();
    await act(async () => result.current.takePossession("Wolves"));
    expect(result.current.state.possession).toBe("Wolves");
    expect(result.current.session.setPossession).toHaveBeenCalledWith("Wolves", undefined);
    expect(result.current.refs.possessionInFlightRef.current).toBe(false);

    await act(async () => result.current.takePossession("Wolves", "op-1"));
    expect(result.current.session.setPossession).toHaveBeenCalledTimes(1);
    result.current.refs.possessionInFlightRef.current = true;
    await act(async () => result.current.takePossession("Ravens"));
    expect(result.current.session.setPossession).toHaveBeenCalledTimes(1);
    result.current.refs.possessionInFlightRef.current = false;

    // Read-only (queue paused for another device) refuses a real change:
    // the target differs from the current holder, so only `readOnly` stops it.
    Object.assign(h.status, { paused: "device" });
    const blocked = setup();
    expect(blocked.result.current.readOnly).toBe(true);
    await act(async () => blocked.result.current.takePossession("Wolves"));
    expect(blocked.result.current.session.setPossession).not.toHaveBeenCalled();
    expect(blocked.result.current.state.possession).toBe("Ravens");
    Object.assign(h.status, { paused: null });

    // A rejected write rolls back to the previous holder; with the re-sync
    // read failing too, the rollback is what stays on screen.
    const failing = setup();
    failing.result.current.session.setPossession.mockRejectedValueOnce(new Error("nope"));
    failing.result.current.session.refresh.mockRejectedValueOnce(new Error("offline"));
    await act(async () => failing.result.current.takePossession("Wolves"));
    expect(failing.result.current.state.possession).toBe("Ravens");
    expect(failing.result.current.state.possessionError).toContain(
      "Der Ballbesitz konnte nicht geändert werden",
    );
    expect(failing.result.current.state.possessionPending).toBe(false);

    // The server may have applied the rejected PUT after all: the re-sync
    // then wins over the rollback.
    const applied = setup();
    applied.result.current.session.setPossession.mockRejectedValueOnce(new Error("late"));
    await act(async () => applied.result.current.takePossession("Wolves"));
    expect(applied.result.current.session.refresh).toHaveBeenCalled();
    expect(applied.result.current.state.possession).toBe("Wolves");
  });

  it("undoes local and server rows and keeps PAT prompts in sync", async () => {
    const { result } = setup();
    const local = row({ teamLogId: -2, eventSeq: null });
    await act(async () => result.current.undo(local));
    expect(result.current.session.undo).toHaveBeenCalledWith(
      expect.objectContaining({ team_log_id: -2 }),
      -2,
      undefined,
    );

    const server = row({ teamLogId: 9, eventSeq: 4, groupSequence: 3 });
    await act(async () => result.current.undo(server, { keepPossession: true }));
    expect(result.current.session.undo).toHaveBeenCalledWith(
      expect.objectContaining({ undo_of: 4 }),
      undefined,
      undefined,
    );

    const withPat = setup(
      { pendingPat: { team: "Ravens", group: 3 } },
      makeLog({
        events: [logEvent({ id: 2, sequence: 3, event: "Touchdown", team: "Ravens" })],
      }),
    );
    await act(async () => withPat.result.current.undo(server));
    expect(withPat.result.current.closePat).toHaveBeenCalledTimes(1);
    const nullGroup = setup(
      { pendingPat: { team: "Wolves", group: null } },
      makeLog({
        events: [logEvent({ id: 2, sequence: 3, event: "Touchdown", team: "Ravens" })],
      }),
    );
    await act(async () => nullGroup.result.current.undo(server));
    expect(nullGroup.result.current.closePat).not.toHaveBeenCalled();
    const otherGroup = setup({ pendingPat: { team: "Wolves", group: 7 } });
    await act(async () => otherGroup.result.current.undo(server));
    expect(otherGroup.result.current.closePat).not.toHaveBeenCalled();

    const tryRow = row({ event: "1-Extra-Punkt", groupSequence: 3 });
    const reopen = setup(
      {},
      makeLog({
        events: [
          logEvent({
            id: 3,
            sequence: 3,
            event: "1-Extra-Punkt",
            team: "Ravens",
          }),
        ],
      }),
    );
    await act(async () => reopen.result.current.undo(tryRow, { keepPossession: true }));
    expect(reopen.result.current.reopenPat).toHaveBeenCalled();

    const failing = setup();
    failing.result.current.session.undo.mockRejectedValueOnce(new Error("nope"));
    await act(async () => failing.result.current.undo(server));
    expect(failing.result.current.state.undoError).toContain(
      "Der Eintrag konnte nicht rückgängig gemacht werden",
    );

    const restoring = setup();
    await act(async () =>
      restoring.result.current.undo(
        row({ event: "Turnover", team: "Wolves", groupSequence: 0 }),
      ),
    );
    expect(restoring.result.current.state.possession).toBe("Wolves");

    const guarded = setup();
    guarded.result.current.refs.undoInFlightRef.current = true;
    await act(async () => guarded.result.current.undo(server));
    expect(guarded.result.current.session.undo).not.toHaveBeenCalled();
    const halftime = setup({ halftimePending: true });
    await act(async () => halftime.result.current.undo(server));
    expect(halftime.result.current.session.undo).not.toHaveBeenCalled();
  });

  it("opens corrections only for editable rows of a live game", async () => {
    const { result } = setup();
    act(() => result.current.openEdit(row()));
    expect(result.current.state.editing?.key).toBe("row-1");
    act(() => result.current.openEdit(row({ team: null })));
    expect(result.current.state.editing?.key).toBe("row-1");
    const readOnly = setup({ game: game("beendet") });
    act(() => readOnly.result.current.openEdit(row()));
    expect(readOnly.result.current.state.editing).toBeNull();

    // A live game whose queue is paused for another device is read-only too.
    Object.assign(h.status, { paused: "device" });
    const paused = setup();
    expect(paused.result.current.readOnly).toBe(true);
    act(() => paused.result.current.openEdit(row()));
    expect(paused.result.current.state.editing).toBeNull();
    Object.assign(h.status, { paused: null });
  });

  it("writes a corrected event and guards every refusal path", async () => {
    const { result } = setup({ editing: row() });
    await act(async () => {
      await result.current.submitEdit({ name: "First Down", input: "9" });
    });
    expect(result.current.session.writeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: 42, team: "Ravens", half: 1 }),
    );
    expect(result.current.state.editing).toBeNull();

    const grouped = setup({
      editing: row({ eventSeq: null, groupSequence: 0, half: 2 }),
    });
    await act(async () => {
      await grouped.result.current.submitEdit({ name: "First Down" });
    });
    expect(grouped.result.current.session.writeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ half: 2 }),
    );

    const filtered = setup(
      { editing: row({ groupSequence: 3 }) },
      makeLog({
        events: [
          logEvent({ id: 4, sequence: 3, event: "First Down", isDeleted: true }),
          logEvent({ id: 5, sequence: 9, event: "First Down" }),
          logEvent({ id: 6, sequence: 3, event: "First Down" }),
        ],
      }),
    );
    await act(async () => {
      await filtered.result.current.submitEdit({ name: "First Down" });
    });
    expect(filtered.result.current.session.writeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: [expect.objectContaining({ name: "First Down" })],
      }),
    );

    const empty = setup();
    await expect(
      act(async () => {
        await empty.result.current.submitEdit({ name: "First Down" });
      }),
    ).resolves.toBeUndefined();
    expect(empty.result.current.session.writeEvent).not.toHaveBeenCalled();
    const noTeam = setup({ editing: row({ team: null }) });
    await expect(
      act(async () => {
        await noTeam.result.current.submitEdit({ name: "First Down" });
      }),
    ).resolves.toBeUndefined();
    expect(noTeam.result.current.session.writeEvent).not.toHaveBeenCalled();

    const busy = setup({ editing: row() });
    busy.result.current.refs.postInFlightRef.current = true;
    await expect(
      act(async () => {
        await busy.result.current.submitEdit({ name: "First Down" });
      }),
    ).rejects.toThrow("Der Eintrag wird gerade gespeichert");
    const finished = setup({ editing: row(), game: game("beendet") });
    await expect(
      act(async () => {
        await finished.result.current.submitEdit({ name: "First Down" });
      }),
    ).rejects.toThrow("Dieses Spiel ist beendet");
    Object.assign(h.status, { paused: "device" });
    const readOnly = setup({ editing: row() });
    await expect(
      act(async () => {
        await readOnly.result.current.submitEdit({ name: "First Down" });
      }),
    ).rejects.toThrow();
    Object.assign(h.status, { paused: null });
  });
});

describe("useTrackingLog nullish and side fallbacks (Phase 3 characterization)", () => {
  const editableRow = (): LogRow =>
    ({
      key: "edit",
      teamLogId: 8,
      eventSeq: 2,
      groupSequence: 4,
      team: "Ravens",
      event: "First Down",
      player: null,
      input: null,
      half: 1,
      cop: false,
      isDeleted: false,
      time: null,
      payload: null,
    }) as LogRow;
  it("handles a refresh payload without a marker and rows without team or time", async () => {
    const withEmptyRows = setup(
      {},
      makeLog({
        events: [
          logEvent({ id: 7, event: "Auszeit", team: null, input: null }),
        ],
      }),
    );
    await waitFor(() => expect(withEmptyRows.result.current.timeouts).toHaveLength(1));
    expect(withEmptyRows.result.current.timeouts[0]).toEqual({
      team: "–",
      half: 1,
      time: "–",
    });

    const withoutMarker = { ...makeLog(), inPossession: undefined };
    const { result } = setup();
    await act(async () => {
      result.current.emit(withoutMarker as GameLog, "refresh");
    });
    expect(result.current.state.possession).toBeNull();

    result.current.session.refresh.mockResolvedValueOnce(withoutMarker);
    await act(async () => result.current.resyncPossession());
    expect(result.current.state.possession).toBeNull();
  });

  it("resolves every possession side and name fallback", async () => {
    const noBall = setup({ possession: null });
    expect(noBall.result.current.possessionSide).toBeNull();
    expect(noBall.result.current.opponentSide).toBeNull();
    expect(noBall.result.current.possessionName).toBeNull();
    expect(noBall.result.current.opponentName).toBe("Wolves");

    const away = setup({ possession: "Wolves" });
    expect(away.result.current.possessionSide).toBe("away");
    expect(away.result.current.opponentSide).toBe("home");
    expect(away.result.current.possessionName).toBe("Wolves");
    expect(away.result.current.opponentName).toBe("Ravens");

    const unknown = setup({ possession: "Unknown" });
    expect(unknown.result.current.possessionSide).toBeNull();
    expect(unknown.result.current.possessionName).toBe("Unknown");

    const unnamed = setup(
      { possession: "Ravens" },
      makeLog({ home: team("  ") }),
    );
    expect(unnamed.result.current.possessionName).toBe("Ravens");
  });

  it("uses group-independent PAT matching, a null stop reason and a null local marker", async () => {
    const noGroup = setup({ pendingPat: { team: "Ravens" } });
    await act(async () =>
      noGroup.result.current.undo(
        {
          key: "td",
          teamLogId: 8,
          eventSeq: 2,
          groupSequence: 4,
          team: "Ravens",
          event: "Turnover",
          player: null,
          input: null,
          half: 1,
          cop: false,
          isDeleted: false,
          time: null,
          payload: null,
        } as LogRow,
      ),
    );
    expect(noGroup.result.current.closePat).not.toHaveBeenCalled();

    Object.assign(h.status, { paused: "auth" });
    const readOnly = setup({ editing: editableRow() });
    await expect(
      act(async () => {
        await readOnly.result.current.submitEdit({ name: "First Down" });
      }),
    ).rejects.toThrow("Dieses Gerät darf keine Einträge schreiben.");
    Object.assign(h.status, { paused: null });

    const local = setup(
      {},
      makeLog({ inPossession: null }),
    );
    await act(async () =>
      local.result.current.undo({
        key: "local",
        teamLogId: -3,
        eventSeq: null,
        groupSequence: 0,
        team: "Ravens",
        event: "Turnover",
        player: null,
        input: null,
        half: 1,
        cop: false,
        isDeleted: false,
        time: null,
        payload: null,
      } as LogRow),
    );
    expect(local.result.current.state.possession).toBeNull();
  });
});
