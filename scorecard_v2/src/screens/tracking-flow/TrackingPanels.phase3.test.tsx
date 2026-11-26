import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "fake-indexeddb/auto";

import type { Game, GameLog, GameLogTeam } from "../../api/types";
import { DEFAULT_GEOMETRY, firstAndTen } from "../../app/drive";
import { TeamLogosProvider } from "../../app/teamLogos";
import type { SyncStatus } from "../../session/useSyncStatus";
import { TrackingPanels, type TrackingPanelsProps } from "./TrackingPanels";

const team = (id: number, name: string, score: number): GameLogTeam => ({
  id,
  name,
  score,
  firsthalf: { score: 0, entries: [] },
  secondhalf: { score: 0, entries: [] },
});

const makeLog = (): GameLog => ({
  gameId: 42,
  isFirstHalf: true,
  inPossession: "Ravens",
  events: [],
  home: team(11, "Ravens", 7),
  away: team(12, "Wolves", 0),
});

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

const syncStatus = (overrides: Partial<SyncStatus> = {}): SyncStatus => ({
  pending: 0,
  failed: 0,
  failedOps: [],
  pendingOps: [],
  syncing: false,
  paused: null,
  online: true,
  resume: vi.fn(async () => undefined),
  retry: vi.fn(async () => undefined),
  drop: vi.fn(async () => undefined),
  refresh: vi.fn(),
  ...overrides,
});

const setter = () => vi.fn();
const asyncFn = () => vi.fn(async () => undefined);

function baseProps(overrides: Partial<TrackingPanelsProps> = {}): TrackingPanelsProps {
  return {
    game: GAME,
    status: syncStatus(),
    onBack: undefined,
    onLogout: undefined,
    gamedayName: undefined,
    leagueLabel: undefined,
    staleSince: null,
    canRelease: false,
    log: makeLog(),
    officialLog: makeLog(),
    drained: false,
    officials: null,
    officialsUnavailable: false,
    people: [],
    setup: null,
    rules: null,
    roster: [],
    possession: "Ravens",
    rows: [],
    possessionSide: "home",
    opponentSide: "away",
    possessionName: "Ravens",
    opponentName: "Wolves",
    possessionPending: false,
    halftimePending: false,
    posting: false,
    readOnly: false,
    finished: false,
    penaltyDisabled: false,
    composerDisabled: false,
    touchdownLabel: "Touchdown Ravens",
    halftimeDisabled: false,
    possessionError: null,
    undoError: null,
    quickError: null,
    confirmation: null,
    quick: null,
    finishBlocked: false,
    halftimeError: null,
    patError: null,
    undoKey: null,
    armed: null,
    drive: firstAndTen(),
    trySpot: 5,
    geometry: DEFAULT_GEOMETRY,
    half: 1,
    timeoutsPerHalf: 2,
    possessionTimeouts: null,
    timeouts: [],
    unsportsmanlike: [],
    touchdownGain: null,
    overtime: false,
    patSide: "home",
    patPlayers: [],
    patDefensePlayers: [],
    recentJerseys: [],
    pendingPat: null,
    patTry: null,
    patMiss: null,
    patDefense: false,
    patDefenseJersey: null,
    patJersey: null,
    patQb: null,
    patBusy: false,
    patFirst: { current: null },
    sheet: null,
    sheetHistory: [],
    replacing: null,
    editing: null,
    timeoutTeam: null,
    halftimeOpen: false,
    breakStartedAt: null,
    logTeamName: (t) => t.name ?? null,
    takePossession: asyncFn(),
    openEdit: setter(),
    submitEdit: asyncFn(),
    undo: asyncFn(),
    setTimeoutTeam: setter(),
    openSheet: setter(),
    closeSheet: setter(),
    backSheet: setter(),
    undoQuick: setter(),
    tapSeriesTile: setter(),
    submitPlay: asyncFn(),
    submitSeries: asyncFn(),
    pickFromSpielzug: setter(),
    takeTimeout: asyncFn(),
    answerPat: setter(),
    writePat: asyncFn(),
    writeDefensiveTry: asyncFn(),
    writeMissedPat: asyncFn(),
    patSideOf: () => "home",
    submit: asyncFn(),
    submitTouchdown: asyncFn(),
    startHalftime: setter(),
    startSecondHalf: setter(),
    openSinglePat: setter(),
    startOvertime: asyncFn(),
    finish: setter(),
    arm: setter(),
    setPatDefense: setter(),
    setPatDefenseJersey: setter(),
    setPatTry: setter(),
    setPatError: setter(),
    setPatJersey: setter(),
    setPatQb: setter(),
    setPatMiss: setter(),
    setEditing: setter(),
    setHalftimeError: setter(),
    setHalftimeOpen: setter(),
    ...overrides,
  };
}

function draw(overrides: Partial<TrackingPanelsProps> = {}) {
  return render(
    <TeamLogosProvider logos={new Map()}>
      <TrackingPanels {...baseProps(overrides)} />
    </TeamLogosProvider>,
  );
}

describe("TrackingPanels (Phase 3 characterization)", () => {
  it("renders the empty-scoreboard shell with the action tiles", () => {
    const { container } = draw();
    expect(container.querySelector(".app-shell.tracking")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Touchdown Ravens/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Spielzug/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Spiel beenden/ })).toBeTruthy();
    expect(screen.getAllByText(/Einträge/)).toHaveLength(2);
  });

  it("shows the finished note instead of the finish button", () => {
    draw({ finished: true });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Dieses Spiel ist beendet.",
    );
    expect(screen.queryByRole("button", { name: /Spiel beenden/ })).toBeNull();
  });

  it("puts the extra-point bar in the touchdown tile's place", () => {
    draw({ pendingPat: { team: "Ravens", jersey: 7 } as never });
    expect(screen.getByRole("group", { name: "Extrapunkt Ravens" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Touchdown/ })).toBeNull();
  });

  it("shows the saved strip with a one-tap undo", () => {
    const undoQuick = vi.fn();
    draw({ confirmation: "Gespeichert", quick: "first", undoQuick });
    const strip = screen.getByRole("status", { name: "Gespeichert" });
    expect(strip).toHaveTextContent("Rückgängig");
    strip.querySelector(".trackok-btn")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(undoQuick).toHaveBeenCalledWith("first");
  });

  it("names stranded entries when the device lost its lock", () => {
    draw({
      status: syncStatus({ paused: "device", pending: 2 }),
      drained: false,
    });
    expect(screen.getByRole("status").textContent).toContain(
      "nicht im offiziellen Spielbericht",
    );
    cleanup();
  });

  it("opens the halftime confirmation sheet with the wired handlers", () => {
    const onStart = vi.fn();
    const onSecondHalf = vi.fn();
    const onClose = vi.fn();
    draw({
      halftimeOpen: true,
      startHalftime: onStart,
      startSecondHalf: onSecondHalf,
      setHalftimeOpen: onClose,
    });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Halbzeit");
    expect(dialog).toHaveTextContent("Ballbesitz");
    const start = screen.getByRole("button", { name: /Halbzeit starten/ });
    fireEvent.click(start);
    expect(onStart).toHaveBeenCalled();
    const close = screen.getByRole("button", { name: /Schließen/ }) ??
      dialog.querySelector(".sheetclose");
    expect(close).toBeTruthy();
    fireEvent.click(close as Element);
    expect(onClose).toHaveBeenCalledWith(false);
    cleanup();
  });
});

describe("TrackingPanels branch characterization (Phase 3)", () => {
  const row = {
    key: "r1",
    teamLogId: 1,
    eventSeq: 1,
    groupSequence: 0,
    team: "Ravens",
    event: "First Down",
    player: null,
    input: null,
    half: 1,
    cop: false,
    isDeleted: false,
    time: null,
    payload: null,
  } as NonNullable<TrackingPanelsProps["editing"]>;

  it("renders a null drive spot without a spot suffix", () => {
    draw({ drive: { ...firstAndTen(), ballOn: null } });
    expect(screen.getByRole("button", { name: /Touchdown/ })).toBeTruthy();
    cleanup();
  });

  it("shows every error, hint, armed and timeout-count state", () => {
    draw({ possessionError: "Kein Ballbesitz" });
    expect(screen.getByText("Kein Ballbesitz")).toBeTruthy();
    cleanup();
    draw({ possessionError: "Kein Ballbesitz", readOnly: true });
    expect(screen.queryByText("Kein Ballbesitz")).toBeNull();
    cleanup();
    draw({ possessionName: null });
    expect(screen.getByText("Ballbesitz wählen, um Einträge zu erfassen.")).toBeTruthy();
    cleanup();
    draw({ confirmation: "Gespeichert", pendingPat: { team: "Ravens", jersey: 7 } as never });
    expect(screen.queryByRole("status", { name: "Gespeichert" })).toBeNull();
    cleanup();
    draw({ confirmation: "Gespeichert", quick: null });
    expect(screen.getByRole("status", { name: "Gespeichert" })).toBeTruthy();
    cleanup();
    draw({ quickError: "nicht gespeichert" });
    expect(screen.getByText("nicht gespeichert")).toBeTruthy();
    cleanup();
    draw({ possessionSide: null });
    expect(screen.getByRole("region", { name: "Einträge" })).toBeTruthy();
    cleanup();
    draw({ possessionTimeouts: { used: 1, total: 2 } as never });
    expect(document.querySelector(".actioncount")).toBeTruthy();
    cleanup();
    draw({ armed: "first" });
    expect(screen.getByText("Nr. ergänzen")).toBeTruthy();
    cleanup();
    draw({ overtime: true });
    expect(screen.getByText("+1 XP")).toBeTruthy();
    cleanup();
    draw({ armed: "overtime" });
    expect(screen.getByText("Overtime starten")).toBeTruthy();
    expect(screen.getByText("Zum Bestätigen erneut tippen")).toBeTruthy();
    cleanup();
    const openSinglePat = vi.fn();
    draw({ overtime: true, openSinglePat });
    fireEvent.click(screen.getByText("+1 XP"));
    expect(openSinglePat).toHaveBeenCalled();
    cleanup();
    const startOvertime = vi.fn(async () => undefined);
    draw({ armed: "overtime", startOvertime });
    fireEvent.click(screen.getByText("Overtime starten"));
    expect(startOvertime).toHaveBeenCalled();
    cleanup();
    draw({ halftimePending: true });
    expect(screen.getByText("Halbzeit …")).toBeTruthy();
    cleanup();
    draw({ halftimeError: "zu früh" });
    expect(screen.getByText("zu früh")).toBeTruthy();
    cleanup();
    draw({ log: { ...makeLog(), isFirstHalf: false }, breakStartedAt: 1000 });
    expect(screen.getByText("Pause")).toBeTruthy();
    cleanup();
    draw({ log: { ...makeLog(), isFirstHalf: false } });
    expect(screen.queryByText("Pause")).toBeNull();
    cleanup();
    draw({ finishBlocked: true });
    expect(screen.getByText(/Extrapunkt nach dem Touchdown/)).toBeTruthy();
    cleanup();
  });

  it("renders the extra-point variants", () => {
    draw({ pendingPat: { team: "Ravens", jersey: null } as never });
    expect(screen.getByText(/ohne Nummer/)).toBeTruthy();
    cleanup();
    draw({
      pendingPat: { team: "Ravens", jersey: 7 } as never,
      patTry: { team: "Ravens", points: 1, defaultJersey: null },
      patBusy: true,
      patError: "fehler",
    });
    expect(screen.getByText(/Speichern/)).toBeTruthy();
    cleanup();
    draw({ pendingPat: { team: "Ravens", jersey: 7 } as never, patTry: null, patDefense: false });
    const defense = screen.getByText("Gegner +2");
    fireEvent.click(defense);
    cleanup();
  });

  it("renders the PAT, missed-PAT, edit and sheet dialogs", () => {
    draw({ patTry: { team: "Ravens", points: 1, defaultJersey: null } });
    expect(screen.getByText("Wer hat den Extrapunkt verwandelt?")).toBeTruthy();
    cleanup();
    draw({ patTry: { team: "Ravens", points: 1, defaultJersey: 7 } });
    expect(screen.getByText(/vorausgewählt/)).toBeTruthy();
    cleanup();
    draw({ patDefense: true, opponentName: null });
    expect(screen.getByText(/Gegner erzielt/)).toBeTruthy();
    cleanup();
    draw({ patMiss: { team: "Ravens", defaultJersey: 7 }, patQb: 9 });
    expect(screen.getByRole("dialog")).toBeTruthy();
    cleanup();
    draw({ editing: row });
    expect(screen.getByRole("dialog")).toBeTruthy();
    cleanup();
    draw({ editing: { ...row, team: "Wolves" } });
    expect(screen.getByRole("dialog")).toBeTruthy();
    cleanup();
    draw({ editing: { ...row, team: null } });
    expect(screen.getByRole("dialog")).toBeTruthy();
    cleanup();
  });

  it("renders every play sheet kind", () => {
    for (const sheet of [
      { kind: "play", type: "run", result: 3 } as never,
      { kind: "fieldpos" },
      { kind: "challenge" },
      { kind: "touchdown" },
      { kind: "series", mode: "first" },
      { kind: "penalty" },
      { kind: "quarterback" },
      { kind: "spielzug" },
      { kind: "more", mode: "safety" },
    ] as never[]) {
      draw({ sheet, sheetHistory: [sheet] as never[], rules: null });
      expect(screen.getByRole("dialog")).toBeTruthy();
      cleanup();
    }
    draw({
      sheet: { kind: "series", mode: "interception" },
      replacing: row,
      opponentName: "Wolves",
      opponentSide: "away",
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    cleanup();
    draw({ sheet: { kind: "play", type: "run", result: 3 } as never, opponentName: null });
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
  });

  it("covers the remaining sheet fallbacks and history buttons", () => {
    const arm = vi.fn();
    draw({ arm });
    fireEvent.click(screen.getByText("Overtime"));
    expect(arm).toHaveBeenCalledWith("overtime");
    cleanup();

    draw({ patDefense: true, patBusy: true });
    expect(screen.getByText(/Speichern/)).toBeTruthy();
    cleanup();
    draw({ patMiss: { team: "Ravens", defaultJersey: null }, opponentName: undefined });
    expect(screen.getByRole("dialog")).toBeTruthy();
    cleanup();

    for (const sheet of [
      { kind: "play", type: "run", result: 3 },
      { kind: "fieldpos" },
      { kind: "challenge" },
      { kind: "series", mode: "first" },
      { kind: "penalty" },
      { kind: "more", mode: "safety" },
    ] as never[]) {
      draw({ sheet, opponentName: undefined, sheetHistory: [] });
      expect(screen.getByRole("dialog")).toBeTruthy();
      cleanup();
    }

    draw({
      sheet: { kind: "series", mode: "interception" },
      replacing: row,
      opponentName: "Wolves",
      opponentSide: "away",
      sheetHistory: [{ kind: "series", mode: "first" }] as never[],
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    cleanup();

    const logTeamName = (t: { name: string | null }) =>
      t.name === "Wolves" ? null : t.name;
    draw({
      halftimeOpen: true,
      logTeamName,
      log: { ...makeLog(), away: team(12, "Wolves", 3), home: team(11, "Ravens", 7) },
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    cleanup();

    draw({
      halftimeOpen: true,
      logTeamName: () => null,
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    cleanup();
  });

  it("renders halftime and timeout dialogs with both directions", () => {
    for (const direction of [undefined, "Nord", "Süd"] as const) {
      draw({
        halftimeOpen: true,
        setup: { direction } as never,
        breakStartedAt: 1000,
        rules: { periods: { intermission_minutes: 5 } } as never,
      });
      expect(screen.getByRole("dialog")).toBeTruthy();
      cleanup();
    }
    draw({ timeoutTeam: "Wolves" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    cleanup();
    draw({
      timeoutTeam: "Ravens",
      rules: { timeouts: { seconds: 45 } } as never,
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    cleanup();
  });
});

