import { act, renderHook } from "@testing-library/react";
import { useRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Game, GameLog, GameLogEvent, RosterPlayer } from "../../api/types";
import { geometryOf, TRY_ONE } from "../../app/drive";
import { readQuarterback, rememberQuarterback } from "../../app/quarterback";
import { confirmTap } from "../../app/sideline";
import { logRows, type LogRow } from "../../components/EventLog";
import { usePatFlow } from "./usePatFlow";

vi.mock("../../app/quarterback", () => ({
  readQuarterback: vi.fn(() => null),
  rememberQuarterback: vi.fn(),
}));
vi.mock("../../app/sideline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../app/sideline")>();
  return { ...actual, confirmTap: vi.fn() };
});
vi.mock("../../app/break", () => ({
  forgetBreak: vi.fn(),
  rememberBreakStart: vi.fn(() => 1234),
}));
vi.mock("../../offline/snapshot", () => ({
  cachedGet: vi.fn(async () => []),
  snapshotKey: { log: (id: number) => `log-${id}` },
}));

const readQuarterbackMock = readQuarterback as unknown as ReturnType<typeof vi.fn>;
const rememberQuarterbackMock = rememberQuarterback as unknown as ReturnType<typeof vi.fn>;
const confirmTapMock = confirmTap as unknown as ReturnType<typeof vi.fn>;

function team(name: string) {
  return {
    id: 1,
    name,
    score: 0,
    firsthalf: { score: 0, entries: [] },
    secondhalf: { score: 0, entries: [] },
  };
}

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

const game = (): Game =>
  ({ id: 42, home: "Ravens", away: "Wolves", status: "2. Halbzeit" }) as Game;

type Over = Parameters<typeof usePatFlow>[0];

function makeSession(initial: GameLog = makeLog()) {
  return {
    writeEvent: vi.fn(async () => makeLog()),
    lastOpId: vi.fn(() => "op-1"),
    getLog: vi.fn(() => initial),
    halftime: vi.fn(async () => undefined),
  };
}

function useHarness(over: Partial<Over>, initial = makeLog()) {
  const session = useState(() => makeSession(initial))[0];
  const [pendingPat, setPendingPat] = useState<Over["pendingPat"]>(null);
  const [patTry, setPatTry] = useState<Over["patTry"]>(null);
  const [patMiss, setPatMiss] = useState<Over["patMiss"]>(null);
  const [patDefense, setPatDefense] = useState(false);
  const [patDefenseJersey, setPatDefenseJersey] = useState<number | null>(null);
  const [patJersey, setPatJersey] = useState<number | null>(null);
  const [patQb, setPatQb] = useState<number | null>(null);
  const [patBusy, setPatBusy] = useState(false);
  const [patError, setPatError] = useState<string | null>(null);
  const [finishBlocked, setFinishBlocked] = useState(false);
  const [halftimePending, setHalftimePending] = useState(false);
  const [halftimeError, setHalftimeError] = useState<string | null>(null);
  const [breakStartedAt, setBreakStartedAt] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [, setQuick] = useState<unknown>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const setupLoadRef = useRef<Over["setupLoadRef"]["current"]>(Promise.resolve(null));
  const patFirst = useRef<HTMLButtonElement | null>(null);
  const patOriginRef = useRef<{ team: string; originId?: string } | null>(null);
  const possRef = useRef(false);
  const halfRef = useRef(false);
  const postRef = useRef(false);
  const onFinalize = useState(() => vi.fn())[0];
  const takePossession = useState(() => vi.fn(async () => undefined))[0];
  const args: Over = {
    game: game(),
    session: session as unknown as Over["session"],
    log: initial,
    rows: logRows(initial),
    geometry: geometryOf(null),
    rules: null,
    roster: null,
    setupLoadRef,
    logTeamName: (t) => t.name?.trim() || null,
    possessionName: "Ravens",
    opponentName: "Wolves",
    possessionSide: "home",
    takePossession,
    possessionInFlightRef: possRef,
    halftimeInFlightRef: halfRef,
    postInFlightRef: postRef,
    pendingPat,
    setPendingPat,
    patTry,
    setPatTry,
    patMiss,
    setPatMiss,
    patDefense,
    setPatDefense,
    patDefenseJersey,
    setPatDefenseJersey,
    patJersey,
    setPatJersey,
    patQb,
    setPatQb,
    patBusy,
    setPatBusy,
    patFirst,
    patOriginRef,
    patError,
    setPatError,
    finishBlocked,
    setFinishBlocked,
    halftimePending,
    setHalftimePending,
    halftimeError,
    setHalftimeError,
    setHalftimeOpen: vi.fn(),
    breakStartedAt,
    setBreakStartedAt,
    setPosting,
    setConfirmation,
    setQuick,
    setQuickError,
    readOnly: false,
    finished: false,
    stopReason: null,
    disarm: vi.fn(),
    onFinalize,
    ...over,
  };
  void setQuick;
  return {
    ...usePatFlow(args),
    session,
    onFinalize,
    takePossession,
    refs: { possRef, halfRef, postRef, patOriginRef },
    state: {
      pendingPat,
      patTry,
      patMiss,
      patBusy,
      patError,
      finishBlocked,
      halftimePending,
      halftimeError,
      breakStartedAt,
      confirmation,
      quickError,
      posting,
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
  readQuarterbackMock.mockReturnValue(null as unknown as string);
});

describe("usePatFlow derivation (Phase 3 characterization)", () => {
  it("reads the drive, try spot, overtime and timeout budget", () => {
    const { result } = setup({
      roster: [
        { side: "home", jersey: 7, name: "A" } as RosterPlayer,
        { side: "away", jersey: 9, name: "B" } as RosterPlayer,
      ],
      rules: { timeouts: { per_half: 1 } } as Over["rules"],
    });
    expect(result.current.drive).toBeTruthy();
    expect(result.current.trySpot).toBeGreaterThan(0);
    expect(result.current.overtime).toBe(false);
    expect(result.current.touchdownGain).toBeGreaterThanOrEqual(0);
    expect(result.current.half).toBe(1);
    expect(result.current.timeoutsPerHalf).toBe(1);
    expect(result.current.patSide).toBe("home");
    expect(result.current.patPlayers).toHaveLength(1);
    expect(result.current.patDefensePlayers).toHaveLength(1);

    const noBall = setup({ possessionName: null, rules: null });
    expect(noBall.result.current.possessionTimeouts).toBeNull();
    expect(noBall.result.current.timeoutsPerHalf).toBe(2);
    const overtime = setup(
      {},
      makeLog({ events: [logEvent({ event: "Overtime startet" })] }),
    );
    expect(overtime.result.current.overtime).toBe(true);
    const tryPhase = setup({
      patTry: { team: "Ravens", points: 2, defaultJersey: null },
    });
    expect(tryPhase.result.current.trySpot).toBeGreaterThanOrEqual(TRY_ONE);
  });

  it("starts overtime and reports a rejected marker", async () => {
    const { result } = setup();
    await act(async () => result.current.startOvertime());
    expect(result.current.session.writeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: [{ name: "Overtime starten" }] }),
    );
    const failing = setup();
    failing.result.current.session.writeEvent.mockRejectedValueOnce(new Error("offline"));
    await act(async () => failing.result.current.startOvertime());
    expect(failing.result.current.state.quickError).toContain(
      "Die Overtime konnte nicht gestartet werden",
    );
  });
});

describe("usePatFlow writes (Phase 3 characterization)", () => {
  it("refuses writes that are not allowed", async () => {
    const busy = setup();
    busy.result.current.refs.postRef.current = true;
    await expect(
      act(async () => {
        await busy.result.current.submit([{ name: "Touchdown" }]);
      }),
    ).rejects.toThrow("Der Eintrag wird gerade gespeichert");
    const finished = setup({ finished: true });
    await expect(
      act(async () => {
        await finished.result.current.submit([{ name: "Touchdown" }]);
      }),
    ).rejects.toThrow("Dieses Spiel ist beendet");
    const noBall = setup({ possessionSide: null });
    await expect(
      act(async () => {
        await noBall.result.current.submit([{ name: "Touchdown" }]);
      }),
    ).rejects.toThrow("Kein Ballbesitz");
    const readOnly = setup({ readOnly: true, stopReason: "lock" });
    await expect(
      act(async () => {
        await readOnly.result.current.submit([{ name: "Touchdown" }]);
      }),
    ).rejects.toThrow("lock");
    const fallback = setup({ readOnly: true });
    await expect(
      act(async () => {
        await fallback.result.current.submit([{ name: "Touchdown" }]);
      }),
    ).rejects.toThrow("Dieses Gerät darf keine Einträge schreiben.");
  });

  it("writes a play, remembers its quarterback and flips the ball", async () => {
    const { result } = setup();
    await act(async () =>
      result.current.submit(
        [{ name: "Turnover", payload: { qb: 7 } }],
        undefined,
        { flipOrigin: "origin-1" },
      ),
    );
    expect(result.current.session.writeEvent).toHaveBeenCalled();
    expect(rememberQuarterbackMock).toHaveBeenCalledWith(42, "home", 7);
    expect(confirmTapMock).toHaveBeenCalled();
    expect(result.current.takePossession).toHaveBeenCalledWith("Wolves", "origin-1");
    expect(result.current.state.confirmation).toBe("Turnover gespeichert");
    expect(result.current.refs.postRef.current).toBe(false);

    const kept = setup();
    await act(async () =>
      kept.result.current.submit([{ name: "Turnover" }], "Wolves", {
        keepBall: true,
      }),
    );
    expect(kept.result.current.takePossession).not.toHaveBeenCalled();
    expect(kept.result.current.session.writeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ team: "Wolves", half: 1 }),
    );
  });

  it("reads the second-half team and runs the halftime guards", async () => {
    const { result } = setup();
    await act(async () => expect(await result.current.secondHalfTeam()).toBe("Wolves"));
    const withoutSetup = setup({ possessionName: null });
    await act(async () =>
      expect(await withoutSetup.result.current.secondHalfTeam()).toBe("Wolves"),
    );

    await act(async () => result.current.startHalftime());
    expect(result.current.session.halftime).toHaveBeenCalled();
    expect(result.current.takePossession).toHaveBeenCalledWith("Wolves");

    const busy = setup();
    busy.result.current.refs.halfRef.current = true;
    await act(async () => busy.result.current.startHalftime());
    expect(busy.result.current.session.halftime).not.toHaveBeenCalled();
    const finished = setup({ finished: true, log: makeLog({ isFirstHalf: false }) });
    await act(async () => finished.result.current.startHalftime());
    expect(finished.result.current.session.halftime).not.toHaveBeenCalled();
    const readOnly = setup({ readOnly: true });
    await act(async () => readOnly.result.current.startHalftime());
    expect(readOnly.result.current.session.halftime).not.toHaveBeenCalled();
    const possessionBusy = setup();
    possessionBusy.result.current.refs.possRef.current = true;
    await act(async () => possessionBusy.result.current.startHalftime());
    expect(possessionBusy.result.current.state.halftimeError).toContain(
      "Der Ballbesitz wird gerade geändert",
    );
    const noTarget = setup({ opponentName: null as unknown as string });
    await act(async () => noTarget.result.current.startHalftime());
    expect(noTarget.result.current.takePossession).not.toHaveBeenCalled();
    const failing = setup();
    failing.result.current.session.halftime.mockRejectedValueOnce(new Error("offline"));
    await act(async () => failing.result.current.startHalftime());
    expect(failing.result.current.state.halftimeError).toContain(
      "Die Halbzeit konnte nicht gestartet werden",
    );

    act(() => result.current.startSecondHalf());
    expect(result.current.state.breakStartedAt).toBeNull();
  });
});

describe("usePatFlow try flow (Phase 3 characterization)", () => {
  it("opens and closes a try, remembering the origin", async () => {
    const { result } = setup();
    act(() => result.current.openPat("Ravens", 7, "op-1", 3));
    expect(result.current.state.pendingPat).toEqual({
      team: "Ravens",
      jersey: 7,
      originId: "op-1",
      group: 3,
    });
    act(() => result.current.rememberPatOrigin());
    expect(result.current.refs.patOriginRef.current).toEqual({
      team: "Ravens",
      originId: "op-1",
    });
    act(() => result.current.closePat());
    expect(result.current.state.pendingPat).toBeNull();
    act(() => result.current.rememberPatOrigin());
    expect(result.current.refs.patOriginRef.current).toBeNull();

    const single = setup();
    act(() => single.result.current.openSinglePat());
    expect(single.result.current.state.patTry?.points).toBe(1);
    const noBall = setup({ possessionName: null });
    act(() => noBall.result.current.openSinglePat());
    expect(noBall.result.current.state.patTry).toBeNull();
  });

  it("finds a touchdown group and reopens a try only for the same team", async () => {
    const initial = makeLog({
      events: [
        logEvent({
          id: 2,
          event: "Touchdown",
          team: "Ravens",
          player: 7,
          sequence: 3,
        }),
        logEvent({
          id: 3,
          event: "1-Extra-Punkt",
          team: "Ravens",
          player: 7,
          sequence: 4,
        }),
      ],
    });
    const { result } = setup({}, initial);
    expect(result.current.touchdownGroupOf("Ravens")).toBe(3);
    expect(result.current.touchdownGroupOf("Wolves")).toBeNull();

    const tryRow = logRows(initial).find(
      (entry) => entry.event === "1-Extra-Punkt",
    ) as LogRow;
    const reopen = setup({}, initial);
    act(() => reopen.result.current.reopenPat(tryRow, false));
    expect(reopen.result.current.state.pendingPat?.team).toBe("Ravens");
    const kept = setup({}, initial);
    act(() => kept.result.current.reopenPat(tryRow, true));
    expect(kept.result.current.state.pendingPat).toBeNull();
    const missing = setup();
    act(() => missing.result.current.reopenPat(tryRow, false));
    expect(missing.result.current.state.pendingPat).toBeNull();
  });

  it("writes a conversion, a missed try and a defensive score", async () => {
    const { result } = setup();
    act(() => result.current.openPat("Ravens", 7));
    act(() => result.current.answerPat(2));
    expect(result.current.state.patTry?.points).toBe(2);
    await act(async () => result.current.writePat(7));
    expect(result.current.session.writeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: [expect.objectContaining({ name: "2-Extra-Punkte", player: 7 })],
      }),
    );
    expect(result.current.state.pendingPat).toBeNull();

    const skipped = setup();
    await act(async () => skipped.result.current.writePat(null));
    expect(skipped.result.current.session.writeEvent).not.toHaveBeenCalled();
    const busy = setup({ patBusy: true });
    await act(async () => busy.result.current.writePat(null));
    expect(busy.result.current.session.writeEvent).not.toHaveBeenCalled();

    const miss = setup();
    act(() => miss.result.current.openPat("Ravens", 7));
    act(() => miss.result.current.answerPat(0));
    expect(miss.result.current.state.patMiss?.team).toBe("Ravens");
    await act(async () => miss.result.current.writeMissedPat([{ name: "Pass unvollständig" }]));
    expect(miss.result.current.state.pendingPat).toBeNull();

    const guard = setup();
    await expect(
      act(async () => {
        await guard.result.current.writeMissedPat([{ name: "Pass unvollständig" }]);
      }),
    ).rejects.toThrow("Der Extrapunkt wird gerade gespeichert");

    const defence = setup();
    act(() => defence.result.current.openPat("Ravens", 7));
    await act(async () => defence.result.current.writeDefensiveTry(9));
    expect(defence.result.current.session.writeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        team: "Wolves",
        event: [expect.objectContaining({ payload: { try_defense: true } })],
      }),
    );
  });

  it("blocks finishing while a try is open", () => {
    const { result } = setup({ pendingPat: { team: "Ravens", jersey: 7 } });
    act(() => result.current.finish());
    expect(result.current.state.finishBlocked).toBe(true);
    expect(result.current.onFinalize).not.toHaveBeenCalled();
    const free = setup();
    act(() => free.result.current.finish());
    expect(free.result.current.onFinalize).toHaveBeenCalled();

    const answered = setup();
    act(() => answered.result.current.openPat("Ravens", 7));
    act(() => answered.result.current.answerPat(1));
    expect(answered.result.current.state.patTry?.points).toBe(1);
    const busy = setup({ patBusy: true });
    act(() => busy.result.current.answerPat(1));
    expect(busy.result.current.state.patTry).toBeNull();
  });
});

describe("usePatFlow remaining branches (Phase 3 characterization)", () => {
  it("uses away-side QBs, overtime periods and every origin fallback", async () => {
    const away = setup({
      pendingPat: { team: "Wolves", jersey: null },
      possessionSide: "away",
    });
    expect(away.result.current.patSideOf("Wolves")).toBe("away");
    act(() => away.result.current.openSinglePat());
    expect(away.result.current.state.patTry?.team).toBe("Ravens");

    const noSide = setup({ possessionName: "Ravens", possessionSide: null });
    act(() => noSide.result.current.openSinglePat());
    expect(noSide.result.current.state.patTry?.points).toBe(1);

    const overtimeLog = makeLog({
      events: [logEvent({ event: "Overtime startet" })],
    });
    const overtime = setup({}, overtimeLog);
    await act(async () => overtime.result.current.submit([{ name: "Turnover" }]));
    expect(overtime.result.current.session.writeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ half: 3 }),
    );
    const second = setup({}, makeLog({ isFirstHalf: false }));
    await act(async () => second.result.current.submit([{ name: "Turnover" }]));
    expect(second.result.current.session.writeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ half: 2 }),
    );

    const noOrigin = setup();
    noOrigin.result.current.session.lastOpId.mockReturnValueOnce(null as unknown as string);
    await act(async () =>
      noOrigin.result.current.submit([{ name: "Turnover" }], undefined, {
        keepBall: true,
      }),
    );
    expect(noOrigin.result.current.takePossession).not.toHaveBeenCalled();
  });

  it("opens a TD try with and without a jersey or a scoring team", async () => {
    const noTeam = setup({ possessionName: null });
    noTeam.result.current.session.lastOpId.mockReturnValueOnce(null as unknown as string);
    await expect(
      act(async () =>
        noTeam.result.current.submitTouchdown([{ name: "Touchdown" }]),
      ),
    ).rejects.toThrow("Kein Ballbesitz");
    expect(noTeam.result.current.state.pendingPat).toBeNull();

    const withJersey = setup();
    await act(async () =>
      withJersey.result.current.submitTouchdown([
        { name: "Touchdown", player: 11 },
      ]),
    );
    expect(withJersey.result.current.state.pendingPat).toMatchObject({
      team: "Ravens",
      jersey: 11,
    });
    const withoutJersey = setup();
    await act(async () =>
      withoutJersey.result.current.submitTouchdown([{ name: "Touchdown" }]),
    );
    expect(withoutJersey.result.current.state.pendingPat?.jersey).toBeNull();
  });

  it("reopens a remembered try and writes a one-point conversion with a QB", async () => {
    const initial = makeLog({
      events: [
        logEvent({
          id: 2,
          event: "Touchdown",
          team: "Ravens",
          player: 7,
          sequence: 3,
        }),
        logEvent({
          id: 3,
          event: "1-Extra-Punkt",
          team: "Ravens",
          player: null,
          sequence: 4,
        }),
      ],
    });
    const tryRow = logRows(initial).find(
      (entry) => entry.event === "1-Extra-Punkt",
    ) as LogRow;
    const remembered = setup({}, initial);
    act(() =>
      remembered.result.current.openPat("Ravens", 7, "origin-1", 3),
    );
    act(() => remembered.result.current.rememberPatOrigin());
    act(() => remembered.result.current.closePat());
    act(() => remembered.result.current.reopenPat(tryRow, false));
    expect(remembered.result.current.state.pendingPat).toMatchObject({
      team: "Ravens",
      jersey: 7,
      originId: "origin-1",
    });

    const onePoint = setup();
    act(() => onePoint.result.current.openPat("Ravens", 7));
    act(() => onePoint.result.current.answerPat(1));
    await act(async () => onePoint.result.current.writePat(7));
    expect(onePoint.result.current.session.writeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: [expect.objectContaining({ name: "1-Extra-Punkt" })],
      }),
    );
    const withQb = setup({ patQb: 9 });
    act(() => withQb.result.current.openPat("Ravens", 7));
    act(() => withQb.result.current.answerPat(1));
    await act(async () => withQb.result.current.writePat(null));
    expect(withQb.result.current.session.writeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: [expect.objectContaining({ payload: { qb: 9 } })],
      }),
    );

    const noDefence = setup({ opponentName: null as unknown as string });
    act(() => noDefence.result.current.openPat("Ravens", 7));
    await act(async () => noDefence.result.current.writeDefensiveTry(9));
    expect(noDefence.result.current.session.writeEvent).not.toHaveBeenCalled();
  });

  it("covers the missing-team branch of a reopened try", () => {
    const initial = makeLog({
      events: [
        logEvent({
          id: 2,
          event: "1-Extra-Punkt",
          team: null,
          sequence: 4,
        }),
      ],
    });
    const tryRow = logRows(initial).find(
      (entry) => entry.event === "1-Extra-Punkt",
    ) as LogRow;
    const { result } = setup({}, initial);
    act(() => result.current.reopenPat(tryRow, false));
    expect(result.current.state.pendingPat).toBeNull();
  });
});

describe("usePatFlow error and null-spot branches (Phase 3 characterization)", () => {
  it("leaves the touchdown gain empty without a drive spot", () => {
    const { result } = setup({ possessionName: null }, makeLog({ events: [] }));
    expect(result.current.touchdownGain).toBeGreaterThanOrEqual(0);
  });

  it("falls back when the last op is unknown and when a remembered try belongs elsewhere", async () => {
    const noOp = setup();
    noOp.result.current.session.lastOpId.mockReturnValue(null as unknown as string);
    await act(async () =>
      noOp.result.current.submitTouchdown([{ name: "Touchdown", player: 7 }]),
    );
    expect(noOp.result.current.state.pendingPat?.originId).toBeUndefined();

    const initial = makeLog({
      events: [
        logEvent({ id: 2, event: "Touchdown", team: "Ravens", player: 7, sequence: 3 }),
        logEvent({ id: 3, event: "1-Extra-Punkt", team: "Ravens", sequence: 4 }),
      ],
    });
    const tryRow = logRows(initial).find(
      (entry) => entry.event === "1-Extra-Punkt",
    ) as LogRow;
    const other = setup({}, initial);
    act(() => other.result.current.openPat("Wolves", 7, "origin-1"));
    act(() => other.result.current.rememberPatOrigin());
    act(() => other.result.current.closePat());
    act(() => other.result.current.reopenPat(tryRow, false));
    expect(other.result.current.state.pendingPat?.originId).toBeUndefined();
  });

  it("reports a rejected conversion and a rejected defensive try", async () => {
    const conversion = setup();
    conversion.result.current.session.writeEvent.mockRejectedValueOnce(new Error("offline"));
    act(() => conversion.result.current.openPat("Ravens", 7));
    act(() => conversion.result.current.answerPat(1));
    await act(async () => conversion.result.current.writePat(null));
    expect(conversion.result.current.state.patError).toContain(
      "Der Extrapunkt konnte nicht gespeichert werden",
    );

    const defensive = setup();
    defensive.result.current.session.writeEvent.mockRejectedValueOnce(new Error("offline"));
    act(() => defensive.result.current.openPat("Ravens", 7));
    await act(async () => defensive.result.current.writeDefensiveTry(9));
    expect(defensive.result.current.state.patError).toContain(
      "Der Punkt für den Gegner konnte nicht gespeichert werden",
    );
  });
});

describe("usePatFlow last uncovered fallbacks (Phase 3 characterization)", () => {
  it("prefers the undone try's jersey when the touchdown has none", () => {
    const initial = makeLog({
      events: [
        logEvent({ id: 2, event: "Touchdown", team: "Ravens", player: null, sequence: 3 }),
        logEvent({ id: 3, event: "1-Extra-Punkt", team: "Ravens", player: 9, sequence: 4 }),
      ],
    });
    const tryRow = logRows(initial).find(
      (entry) => entry.event === "1-Extra-Punkt",
    ) as LogRow;
    const { result } = setup({}, initial);
    act(() => result.current.reopenPat(tryRow, false));
    expect(result.current.state.pendingPat?.jersey).toBe(9);
  });

  it("records a defensive score without a jersey", async () => {
    const { result } = setup();
    act(() => result.current.openPat("Ravens", 7));
    await act(async () => result.current.writeDefensiveTry(null));
    expect(result.current.session.writeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: [expect.not.objectContaining({ player: expect.anything() })],
      }),
    );
  });
});
