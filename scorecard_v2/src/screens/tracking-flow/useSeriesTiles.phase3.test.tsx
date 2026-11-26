import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GameLogEvent } from "../../api/types";
import { driveAfter, geometryOf } from "../../app/drive";
import { logRows, type LogRow } from "../../components/EventLog";
import { seriesEvent } from "../../components/sheets/SeriesSheet";
import type { SheetState } from "./logic";
import { useSeriesTiles } from "./useSeriesTiles";

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

const log = (events: GameLogEvent[]) => ({
  gameId: 42,
  isFirstHalf: true,
  inPossession: "Ravens",
  events,
  home: team("Ravens"),
  away: team("Wolves"),
});

type Over = Parameters<typeof useSeriesTiles>[0];

function useHarness(over: Partial<Over> = {}) {
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [sheetHistory, setSheetHistory] = useState<SheetState[]>([]);
  const [replacing, setReplacing] = useState<LogRow | null>(null);
  const [quick, setQuick] = useState<"first" | "turnover" | "interception" | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const submit = useState(() => vi.fn(async () => undefined))[0];
  const undo = useState(() => vi.fn(async () => undefined))[0];
  const openPat = useState(() => vi.fn())[0];
  const touchdownGroupOf = useState(() => vi.fn(() => 3))[0];
  const openSinglePat = useState(() => vi.fn())[0];
  const startOvertime = useState(() => vi.fn(async () => undefined))[0];
  const arm = useState(() => vi.fn())[0];
  const disarm = useState(() => vi.fn())[0];
  const session = useState(() => ({
    lastOpId: vi.fn(() => "op-1"),
  }))[0];
  const events = [logEvent({ id: 1, event: "First Down", player: 7 })];
  const args: Over = {
    rows: logRows(log(events)),
    session: session as unknown as Over["session"],
    possessionName: "Ravens",
    opponentName: "Wolves",
    drive: driveAfter([], geometryOf(null), null),
    geometry: geometryOf(null),
    sheet,
    setSheet,
    sheetHistory,
    setSheetHistory,
    replacing,
    setReplacing,
    setQuick: setQuick as Over["setQuick"],
    setConfirmation,
    setQuickError,
    armed: null,
    arm: arm as Over["arm"],
    disarm,
    submit: submit as Over["submit"],
    undo: undo as Over["undo"],
    openPat,
    touchdownGroupOf,
    overtime: false,
    openSinglePat,
    startOvertime,
    ...over,
  };
  return {
    ...useSeriesTiles(args),
    state: { sheet, sheetHistory, replacing, quick, confirmation, quickError },
    session,
    mocks: { submit, undo, openPat, touchdownGroupOf, openSinglePat, startOvertime, arm, disarm },
  };
}

function setup(over: Partial<Over> = {}) {
  return renderHook(() => useHarness(over));
}

beforeEach(() => vi.clearAllMocks());

describe("useSeriesTiles sheets (Phase 3 characterization)", () => {
  it("opens, stacks and closes sheets", () => {
    const { result } = setup();
    act(() => result.current.openSheet({ kind: "series", mode: "first" }));
    expect(result.current.state.sheet).toEqual({ kind: "series", mode: "first" });
    act(() => result.current.openSheet({ kind: "fieldpos" }));
    expect(result.current.state.sheetHistory).toHaveLength(1);
    act(() => result.current.backSheet());
    expect(result.current.state.sheet).toEqual({ kind: "series", mode: "first" });
    expect(result.current.state.sheetHistory).toHaveLength(0);
    act(() => result.current.backSheet());
    expect(result.current.state.sheet).toBeNull();
    act(() => result.current.openSheet({ kind: "penalty" }));
    act(() => result.current.closeSheet());
    expect(result.current.state.sheet).toBeNull();
    expect(result.current.state.replacing).toBeNull();
  });

  it("routes every Spielzug pick to its handler", async () => {
    const { result } = setup();
    act(() => result.current.pickFromSpielzug("overtime"));
    expect(result.current.mocks.startOvertime).toHaveBeenCalled();
    const withOvertime = setup({ overtime: true });
    act(() => withOvertime.result.current.pickFromSpielzug("overtime"));
    expect(withOvertime.result.current.mocks.openSinglePat).toHaveBeenCalled();
    act(() => result.current.pickFromSpielzug("safety"));
    expect(result.current.state.sheet).toEqual({ kind: "more", mode: "safety" });
    act(() => result.current.pickFromSpielzug("challenge"));
    expect(result.current.state.sheet).toEqual({ kind: "challenge" });
    act(() => result.current.pickFromSpielzug("fieldpos"));
    expect(result.current.state.sheet).toEqual({ kind: "fieldpos" });
    act(() => result.current.pickFromSpielzug("quarterback"));
    expect(result.current.state.sheet).toEqual({ kind: "quarterback" });
    act(() => result.current.pickFromSpielzug("first"));
    expect(result.current.state.sheet).toEqual({ kind: "series", mode: "first" });
  });

  it("finds and undoes a one-tap row, then completes it", async () => {
    const { result } = setup();
    expect(result.current.quickRow("first")?.event).toBe("First Down");
    expect(result.current.quickRow("turnover")).toBeNull();
    const found = result.current.quickRow("first");
    act(() => result.current.undoQuick("first"));
    expect(result.current.mocks.undo).toHaveBeenCalledWith(found);
    expect(result.current.state.quick).toBeNull();
    act(() => result.current.completeQuick("first"));
    expect(result.current.state.replacing).toBeTruthy();
    expect(result.current.state.sheet).toEqual({ kind: "series", mode: "first" });
  });
});

describe("useSeriesTiles tiles (Phase 3 characterization)", () => {
  it("saves a one-tap entry and arms it when a jersey may follow", async () => {
    const { result } = setup();
    await act(async () => result.current.recordOneTap("first"));
    expect(result.current.mocks.submit).toHaveBeenCalledWith([
      seriesEvent("first", null),
    ]);
    expect(result.current.state.quick).toBe("first");
    expect(result.current.mocks.arm).toHaveBeenCalledWith("first");
    const turnover = setup();
    await act(async () => turnover.result.current.recordOneTap("turnover"));
    expect(turnover.result.current.mocks.arm).not.toHaveBeenCalled();

    const failing = setup();
    failing.result.current.mocks.submit.mockRejectedValueOnce(new Error("offline"));
    await act(async () => failing.result.current.recordOneTap("first"));
    expect(failing.result.current.state.quickError).toContain(
      "Der Eintrag konnte nicht gespeichert werden",
    );
  });

  it("routes a tile tap through arm, one-tap and sheet paths", () => {
    const { result } = setup();
    act(() => result.current.tapSeriesTile("first", true));
    expect(result.current.mocks.submit).toHaveBeenCalledWith([
      seriesEvent("first", null),
    ]);
    const sheet = setup();
    act(() => sheet.result.current.tapSeriesTile("turnover", false));
    expect(sheet.result.current.state.sheet).toEqual({
      kind: "series",
      mode: "turnover",
    });
    const armed = setup({ armed: "interception" });
    act(() => armed.result.current.tapSeriesTile("interception", true));
    expect(armed.result.current.state.replacing).toBeNull();
    expect(armed.result.current.state.sheet).toEqual({
      kind: "series",
      mode: "interception",
    });
  });

  it("lists recent jerseys without duplicates or deleted rows", () => {
    const { result } = setup({
      rows: logRows(
        log([
          logEvent({ id: 1, event: "Pass", player: 7 }),
          logEvent({ id: 2, event: "Pass", player: 7 }),
          logEvent({ id: 3, event: "Pass", player: 9, isDeleted: true }),
          logEvent({ id: 4, event: "Pass", player: 11, team: "Wolves" }),
          logEvent({ id: 5, event: "Pass", player: null }),
        ]),
      ),
    });
    expect(result.current.recentJerseys).toEqual([7]);
  });
});

describe("useSeriesTiles play submissions (Phase 3 characterization)", () => {
  it("writes an empty play, a turnover on downs and a scoring play", async () => {
    const { result } = setup();
    await act(async () => result.current.submitPlay([]));
    expect(result.current.mocks.submit).not.toHaveBeenCalled();

    const play = [{ name: "Run", payload: { yards: -20 } }];
    const turnover = setup({
      drive: { down: 4, toGo: 5, ballOn: 20, goal: false } as Over["drive"],
    });
    await act(async () => turnover.result.current.submitPlay(play));
    expect(turnover.result.current.mocks.submit).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "Turnover" })]),
    );

    const score = setup();
    await act(async () =>
      score.result.current.submitPlay([
        { name: "Pass", payload: { yards: 30 } },
        { name: "Touchdown", player: 7 },
      ]),
    );
    expect(score.result.current.mocks.openPat).toHaveBeenCalledWith(
      "Ravens",
      7,
      "op-1",
      3,
    );
    expect(score.result.current.mocks.submit).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: "Touchdown", payload: { yards: 30 } }),
      ]),
    );
  });

  it("writes a defensive score for the opponent", async () => {
    const { result } = setup();
    await act(async () =>
      result.current.submitPlay([
        { name: "Interception" },
        { name: "Touchdown", player: 9, payload: { defense: true } },
      ]),
    );
    expect(result.current.mocks.submit).toHaveBeenCalledWith(
      expect.any(Array),
      "Wolves",
    );
    expect(result.current.mocks.openPat).toHaveBeenCalledWith(
      "Wolves",
      9,
      "op-1",
      3,
    );
  });

  it("takes a timeout with and without a typed clock", async () => {
    const { result } = setup();
    await act(async () => result.current.takeTimeout("Wolves"));
    expect(result.current.mocks.submit).toHaveBeenCalledWith(
      [{ name: "Auszeit" }],
      "Wolves",
    );
    await act(async () => result.current.takeTimeout("Ravens", "12:04"));
    expect(result.current.mocks.submit).toHaveBeenCalledWith(
      [{ name: "Auszeit", input: "12:04" }],
      "Ravens",
    );
  });

  it("replaces a one-tap row with the sheet entry", async () => {
    const row = logRows(log([logEvent({ id: 1, event: "First Down" })]))[0];
    const { result } = setup({ replacing: row });
    await act(async () => result.current.submitSeries([{ name: "Run" }]));
    expect(result.current.mocks.submit).toHaveBeenCalledWith(
      [{ name: "Run" }],
      "Ravens",
      { keepBall: true },
    );
    expect(result.current.mocks.undo).toHaveBeenCalledWith(row, {
      keepPossession: true,
    });
    expect(result.current.state.replacing).toBeNull();

    const fresh = setup();
    await act(async () => fresh.result.current.submitSeries([{ name: "Run" }]));
    expect(fresh.result.current.mocks.submit).toHaveBeenCalledWith(
      [{ name: "Run" }],
      undefined,
      { keepBall: false },
    );
    expect(fresh.result.current.mocks.undo).not.toHaveBeenCalled();
  });
});

describe("useSeriesTiles remaining fallbacks (Phase 3 characterization)", () => {
  it("skips an undo without a matching one-tap row", () => {
    const { result } = setup();
    act(() => result.current.undoQuick("turnover"));
    expect(result.current.mocks.undo).not.toHaveBeenCalled();
  });

  it("keeps a play's typed detail and falls back to the play's jersey", async () => {
    const { result } = setup();
    await act(async () =>
      result.current.submitPlay([
        { name: "Pass", input: "kurz", payload: { yards: 5 } },
        { name: "Touchdown" },
      ]),
    );
    expect(result.current.mocks.submit).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ input: expect.stringContaining("kurz ·") }),
      ]),
    );
    expect(result.current.mocks.openPat).toHaveBeenCalledWith(
      "Ravens",
      null,
      "op-1",
      3,
    );
  });

  it("uses undefined origins and a null defensive jersey", async () => {
    const noOp = setup({
      rows: logRows(log([logEvent({ id: 1, event: "First Down" })])),
    });
    noOp.result.current.session.lastOpId.mockReturnValue(null as unknown as string);
    await act(async () =>
      noOp.result.current.submitPlay([
        { name: "Pass", payload: { yards: 5 } },
        { name: "Touchdown" },
        { name: "Interception", payload: { defense: true } },
      ]),
    );
    expect(noOp.result.current.mocks.openPat).toHaveBeenCalledWith(
      "Ravens",
      null,
      undefined,
      3,
    );
    expect(noOp.result.current.mocks.submit).toHaveBeenCalledWith(
      expect.any(Array),
      "Wolves",
    );

    const noScore = setup();
    await act(async () =>
      noScore.result.current.submitPlay([
        { name: "Interception", payload: { defense: true } },
      ]),
    );
    expect(noScore.result.current.mocks.openPat).not.toHaveBeenCalled();
  });
});

describe("useSeriesTiles defensive try jerseys (Phase 3 characterization)", () => {
  it("opens a pick-six try with a jersey and without a last op", async () => {
    const { result } = setup();
    result.current.session.lastOpId.mockReturnValue(null as unknown as string);
    await act(async () =>
      result.current.submitPlay([
        {
          name: "Touchdown",
          player: 9,
          payload: { defense: true },
        },
      ]),
    );
    expect(result.current.mocks.openPat).toHaveBeenCalledWith(
      "Wolves",
      9,
      undefined,
      3,
    );
  });

  it("opens a pick-six try without a jersey", async () => {
    const { result } = setup();
    await act(async () =>
      result.current.submitPlay([
        { name: "Touchdown", payload: { defense: true } },
      ]),
    );
    expect(result.current.mocks.openPat).toHaveBeenCalledWith(
      "Wolves",
      null,
      "op-1",
      3,
    );
  });
});
