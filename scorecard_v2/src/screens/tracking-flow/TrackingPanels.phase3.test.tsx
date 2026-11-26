import { cleanup, render, screen } from "@testing-library/react";
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
    expect(screen.getByText(/Einträge/)).toBeTruthy();
  });

  it("shows the finished note instead of the finish button", () => {
    draw({ finished: true });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Dieses Spiel ist beendet.",
    );
    expect(screen.queryByRole("button", { name: /Spiel beenden/ })).toBeNull();
  });

  it("puts the extra-point bar in the touchdown tile's place", () => {
    draw({ pendingPat: { team: "Ravens", jersey: 7 } });
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

  it("opens the halftime confirmation sheet when asked", () => {
    draw({ halftimeOpen: true });
    expect(screen.getByRole("dialog")).toBeTruthy();
    cleanup();
  });
});
