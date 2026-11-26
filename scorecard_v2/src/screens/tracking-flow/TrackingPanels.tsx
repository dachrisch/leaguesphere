import type {
  Dispatch,
  RefObject,
  SetStateAction,
} from "react";

import type { GameRules } from "../../api/rules";
import type {
  Game,
  GameLog,
  GameSetup,
  Official,
  RosterPlayer,
  TeamOfficial,
} from "../../api/types";
import { driveText, spotText } from "../../app/drive";
import { readQuarterback, setQuarterback } from "../../app/quarterback";
import { timeoutBudget, timeoutText } from "../../app/timeouts";
import AppHeader from "../../components/AppHeader";
import EventLog, { type LogRow } from "../../components/EventLog";
import ScoreHeader from "../../components/ScoreHeader";
import GameInfo from "../../components/GameInfo";
import SnapshotHint from "../../components/SnapshotHint";
import SyncBadge, { SyncDetails } from "../../components/SyncBadge";
import { directionFromWire } from "../../components/DirectionText";
import {
  ArrowRight,
  Check,
  Clock,
  Flag,
  Football,
  Pause,
  Play,
  PlusCircle,
  Shield,
  Stopwatch,
  SwapArrows,
  User,
} from "../../components/icons";
import JerseyPicker from "../../components/JerseyPicker";
import QuarterbackPick from "../../components/QuarterbackPick";
import ChallengeSheet from "../../components/sheets/ChallengeSheet";
import EditSheet from "../../components/sheets/EditSheet";
import FieldPositionSheet from "../../components/sheets/FieldPositionSheet";
import HalftimeSheet from "../../components/sheets/HalftimeSheet";
import MissedPatSheet from "../../components/sheets/MissedPatSheet";
import MoreSheet from "../../components/sheets/MoreSheet";
import PenaltySheet from "../../components/sheets/PenaltySheet";
import PlaySheet from "../../components/sheets/PlaySheet";
import QuarterbackSheet from "../../components/sheets/QuarterbackSheet";
import SeriesSheet, { type SeriesMode } from "../../components/sheets/SeriesSheet";
import Sheet from "../../components/sheets/Sheet";
import SpielzugSheet from "../../components/sheets/SpielzugSheet";
import TimeoutSheet from "../../components/sheets/TimeoutSheet";
import TouchdownSheet from "../../components/sheets/TouchdownSheet";
import { takeOver } from "../../session/lock";
import type { SyncStatus } from "../../session/useSyncStatus";
import { SyncStrip } from "./SyncStrip";
import {
  secondHalfPossession,
  trackingSubtitle,
  trackingTitle,
  type JerseyLater,
  type SheetState,
  type Side,
} from "./logic";
import type { usePatFlow } from "./usePatFlow";
import type { useSeriesTiles } from "./useSeriesTiles";
import type { useTrackingLog } from "./useTrackingLog";

type PatFlow = ReturnType<typeof usePatFlow>;
type Series = ReturnType<typeof useSeriesTiles>;
type Log = ReturnType<typeof useTrackingLog>;

/**
 * Presentational shell for the tracking screen: the board, possession switch,
 * log, action tiles, composer and every dialog. All state and handlers come
 * from the caller; rendering is byte-identical to the inline screen markup.
 */
export interface TrackingPanelsProps {
  game: Game;
  status: SyncStatus;
  onBack?: () => void;
  onLogout?: () => void;
  gamedayName?: string;
  leagueLabel?: string;
  staleSince?: number | null;
  canRelease: boolean;
  log: GameLog;
  officialLog: GameLog;
  drained: boolean;
  officials: Official[] | null;
  officialsUnavailable: boolean;
  people: TeamOfficial[];
  setup: GameSetup | null;
  rules: GameRules | null;
  roster: RosterPlayer[] | null;
  possession: string | null;
  rows: LogRow[];
  possessionSide: Side | null;
  opponentSide: Side | null;
  possessionName: string | null;
  opponentName: string | null;
  possessionPending: boolean;
  halftimePending: boolean;
  posting: boolean;
  readOnly: boolean;
  finished: boolean;
  penaltyDisabled: boolean;
  composerDisabled: boolean;
  touchdownLabel: string;
  halftimeDisabled: boolean;
  possessionError: string | null;
  undoError: string | null;
  quickError: string | null;
  confirmation: string | null;
  quick: SeriesMode | null;
  finishBlocked: boolean;
  halftimeError: string | null;
  patError: string | null;
  undoKey: string | null;
  armed: JerseyLater | "overtime" | null;
  drive: PatFlow["drive"];
  trySpot: PatFlow["trySpot"];
  geometry: Log["geometry"];
  half: PatFlow["half"];
  timeoutsPerHalf: PatFlow["timeoutsPerHalf"];
  possessionTimeouts: PatFlow["possessionTimeouts"];
  timeouts: Log["timeouts"];
  unsportsmanlike: Log["unsportsmanlike"];
  touchdownGain: PatFlow["touchdownGain"];
  overtime: boolean;
  patSide: PatFlow["patSide"];
  patPlayers: PatFlow["patPlayers"];
  patDefensePlayers: PatFlow["patDefensePlayers"];
  recentJerseys: Series["recentJerseys"];
  pendingPat: {
    team: string;
    jersey: number | null;
    originId?: string;
    group?: number | null;
  } | null;
  patTry: {
    team: string;
    points: 1 | 2;
    defaultJersey: number | null;
  } | null;
  patMiss: { team: string; defaultJersey: number | null } | null;
  patDefense: boolean;
  patDefenseJersey: number | null;
  patJersey: number | null;
  patQb: number | null;
  patBusy: boolean;
  patFirst: RefObject<HTMLButtonElement | null>;
  sheet: SheetState | null;
  sheetHistory: SheetState[];
  replacing: LogRow | null;
  editing: LogRow | null;
  timeoutTeam: string | null;
  halftimeOpen: boolean;
  breakStartedAt: number | null;
  logTeamName: Log["logTeamName"];
  takePossession: Log["takePossession"];
  openEdit: Log["openEdit"];
  submitEdit: Log["submitEdit"];
  undo: Log["undo"];
  setTimeoutTeam: Dispatch<SetStateAction<string | null>>;
  openSheet: Series["openSheet"];
  closeSheet: Series["closeSheet"];
  backSheet: Series["backSheet"];
  undoQuick: Series["undoQuick"];
  tapSeriesTile: Series["tapSeriesTile"];
  submitPlay: Series["submitPlay"];
  submitSeries: Series["submitSeries"];
  pickFromSpielzug: Series["pickFromSpielzug"];
  takeTimeout: Series["takeTimeout"];
  answerPat: PatFlow["answerPat"];
  writePat: PatFlow["writePat"];
  writeDefensiveTry: PatFlow["writeDefensiveTry"];
  writeMissedPat: PatFlow["writeMissedPat"];
  patSideOf: PatFlow["patSideOf"];
  submit: PatFlow["submit"];
  submitTouchdown: PatFlow["submitTouchdown"];
  startHalftime: PatFlow["startHalftime"];
  startSecondHalf: PatFlow["startSecondHalf"];
  openSinglePat: PatFlow["openSinglePat"];
  startOvertime: PatFlow["startOvertime"];
  finish: PatFlow["finish"];
  arm: (key: JerseyLater | "overtime") => void;
  setPatDefense: Dispatch<SetStateAction<boolean>>;
  setPatDefenseJersey: Dispatch<SetStateAction<number | null>>;
  setPatTry: Dispatch<
    SetStateAction<{
      team: string;
      points: 1 | 2;
      defaultJersey: number | null;
    } | null>
  >;
  setPatError: Dispatch<SetStateAction<string | null>>;
  setPatJersey: Dispatch<SetStateAction<number | null>>;
  setPatQb: Dispatch<SetStateAction<number | null>>;
  setPatMiss: Dispatch<
    SetStateAction<{ team: string; defaultJersey: number | null } | null>
  >;
  setEditing: Dispatch<SetStateAction<LogRow | null>>;
  setHalftimeError: Dispatch<SetStateAction<string | null>>;
  setHalftimeOpen: Dispatch<SetStateAction<boolean>>;
}

export function TrackingPanels({
  game,
  status,
  onBack,
  onLogout,
  gamedayName,
  leagueLabel,
  staleSince,
  canRelease,
  log,
  officialLog,
  drained,
  officials,
  officialsUnavailable,
  people,
  setup,
  rules,
  roster,
  possession,
  rows,
  possessionSide,
  opponentSide,
  possessionName,
  opponentName,
  possessionPending,
  halftimePending,
  posting,
  readOnly,
  finished,
  penaltyDisabled,
  composerDisabled,
  touchdownLabel,
  halftimeDisabled,
  possessionError,
  undoError,
  quickError,
  confirmation,
  quick,
  finishBlocked,
  halftimeError,
  patError,
  undoKey,
  armed,
  drive,
  trySpot,
  geometry,
  half,
  timeoutsPerHalf,
  possessionTimeouts,
  timeouts,
  unsportsmanlike,
  touchdownGain,
  overtime,
  patSide,
  patPlayers,
  patDefensePlayers,
  recentJerseys,
  pendingPat,
  patTry,
  patMiss,
  patDefense,
  patDefenseJersey,
  patJersey,
  patQb,
  patBusy,
  patFirst,
  sheet,
  sheetHistory,
  replacing,
  editing,
  timeoutTeam,
  halftimeOpen,
  breakStartedAt,
  logTeamName,
  takePossession,
  openEdit,
  submitEdit,
  undo,
  setTimeoutTeam,
  openSheet,
  closeSheet,
  backSheet,
  undoQuick,
  tapSeriesTile,
  submitPlay,
  submitSeries,
  pickFromSpielzug,
  takeTimeout,
  answerPat,
  writePat,
  writeDefensiveTry,
  writeMissedPat,
  patSideOf,
  submit,
  submitTouchdown,
  startHalftime,
  startSecondHalf,
  openSinglePat,
  startOvertime,
  finish,
  arm,
  setPatDefense,
  setPatDefenseJersey,
  setPatTry,
  setPatError,
  setPatJersey,
  setPatQb,
  setPatMiss,
  setEditing,
  setHalftimeError,
  setHalftimeOpen,
}: TrackingPanelsProps) {
  return (
    <div className="app-shell tracking">
      <AppHeader
        badge={
          <SyncBadge gameId={game.id} status={status} variant="inline" />
        }
        onBack={onBack}
        onLogout={onLogout}
        sub={trackingSubtitle(gamedayName, leagueLabel)}
        title={trackingTitle(game)}
      />
      <SyncDetails gameId={game.id} status={status} withReason={false} />
      <SnapshotHint updatedAt={staleSince} />
      <SyncStrip
        canRelease={canRelease}
        deviceLog={log}
        drained={drained}
        onResume={() => void status.resume()}
        onTakeOver={async () => {
          await takeOver(game.id);
          await status.resume();
        }}
        serverLog={officialLog}
        status={status}
      />
      <main aria-label="Spiel erfassen" className="tracking-layout">
        <GameInfo
          game={game}
          log={log}
          officials={officials}
          officialsUnavailable={officialsUnavailable}
          people={people}
          setup={setup}
        />
        <div className="tracking-controls">
      <ScoreHeader
        away={officialLog.away}
        disabled={possessionPending || halftimePending || readOnly}
        home={officialLog.home}
        isFirstHalf={officialLog.isFirstHalf}
        onPossession={(team) => void takePossession(team)}
        onTimeout={(team) => setTimeoutTeam(team)}
        possession={possession}
        timeoutDisabled={
          posting ||
          possessionPending ||
          halftimePending ||
          finished ||
          readOnly
        }
        timeouts={(team) => {
          const name = logTeamName(team);
          return name === null
            ? null
            : timeoutBudget(rows, name, half, timeoutsPerHalf);
        }}
      />
      <div className="drivebar">
        <p aria-live="polite" className="driveline">
          {pendingPat === null
            ? `${driveText(drive)}${
                spotText(drive.ballOn, geometry) === null
                  ? ""
                  : ` · ${spotText(drive.ballOn, geometry)}`
              }`
            : // the try is its own down: from B5 (one point) or B10 (two),
              // moved by a penalty the log enforced during the try
              `Versuch · ${spotText(trySpot, geometry)}`}
        </p>
        <button
          className="driveset"
          disabled={readOnly || finished}
          onClick={() => openSheet({ kind: "fieldpos" })}
          type="button"
        >
          Feldposition
        </button>
      </div>
      {possessionError === null || readOnly ? null : (
        <p className="trackerror" role="alert">
          {possessionError}
        </p>
      )}
      {finished ? (
        <p className="finishednote" role="status">
          Dieses Spiel ist beendet.
        </p>
      ) : possessionName === null ? (
        <p className="trackhint">Ballbesitz wählen, um Einträge zu erfassen.</p>
      ) : null}
        </div>
      {/* The log owns the free height; the saved strip takes its own line
          below the log instead of covering the newest rows. */}
      <div className="logwrap tracking-log">
        <EventLog
          away={logTeamName(log.away)}
          disabled={halftimePending || readOnly || finished}
          error={undoError}
          home={logTeamName(log.home)}
          onEdit={readOnly || finished ? undefined : openEdit}
          onUndo={(row) => void undo(row)}
          rows={rows}
          undoKey={undoKey}
        />
        {confirmation === null || pendingPat !== null ? null : (
          <div aria-label="Gespeichert" className="trackok" role="status">
            <span className="trackok-text">{confirmation}</span>
            {quick === null ? null : (
              <span className="trackok-actions">
                <button
                  className="trackok-btn"
                  disabled={undoKey !== null}
                  onClick={() => undoQuick(quick)}
                  type="button"
                >
                  Rückgängig
                </button>
              </span>
            )}
          </div>
        )}
        {quickError === null || readOnly ? null : (
          <p className="trackerror" role="alert">
            {quickError}
          </p>
        )}
      </div>
      <section
        aria-label="Einträge"
        className={possessionSide === null ? "actions" : `actions ${possessionSide}`}
      >
        {/* The try comes before any other score: while its result is open,
            the extra point takes the touchdown button's place. */}
        {pendingPat !== null ? (
            <div
              aria-label={`Extrapunkt ${pendingPat.team}`}
              className="patbar"
              role="group"
            >
              <p className="patbar-q">
                Extrapunkt {pendingPat.team} ·{" "}
                {pendingPat.jersey === null
                  ? "ohne Nummer"
                  : `#${pendingPat.jersey}`}{" "}
                – Ergebnis des Versuchs?
              </p>
              <div className="patbar-opts">
                {(
                  [[1, "+1"], [2, "+2"], [0, "nicht verwandelt"]] as const
                ).map(([points, label]) => (
                  <button
                    aria-pressed={false}
                    className="choice choice-dark"
                    disabled={patBusy || readOnly}
                    key={label}
                    onClick={() => answerPat(points)}
                    ref={points === 1 ? patFirst : undefined}
                    type="button"
                  >
                    <span className={points === 0 ? "choice-label" : "choice-num"}>
                      {label}
                    </span>
                  </button>
                ))}
                <button
                  aria-pressed={false}
                  className="choice choice-dark"
                  disabled={patBusy || readOnly || possessionName === null}
                  onClick={() => {
                    setPatDefense(true);
                    setPatDefenseJersey(null);
                    setPatError(null);
                  }}
                  type="button"
                >
                  <span className="choice-label">Gegner +2</span>
                </button>
              </div>
              {patError === null ? null : (
                <p className="patbar-err" role="alert">
                  {patError}
                </p>
              )}
            </div>
        ) : (
          <button
            className={
              possessionSide === null ? "tdbtn" : `tdbtn ${possessionSide}`
            }
            disabled={composerDisabled}
            onClick={() => openSheet({ kind: "touchdown" })}
            type="button"
          >
            <Football className="tdbtn-icon" size={26} />
            <span className="tdbtn-label">{touchdownLabel}</span>
            <kbd aria-hidden="true" className="shortcut-hint" data-key="T" />
          </button>
        )}
        <div className="action-grid">
          <button
            className="action spielzug"
            disabled={composerDisabled}
            onClick={() => openSheet({ kind: "spielzug" })}
            type="button"
          >
            <Play className="action-icon" size={24} />
            <span>Spielzug</span>
            <kbd aria-hidden="true" className="shortcut-hint" data-key="S" />
          </button>
          <button
            className="action"
            disabled={penaltyDisabled}
            onClick={() => openSheet({ kind: "penalty" })}
            type="button"
          >
            <Flag className="action-icon" size={20} />
            <span>Strafe</span>
            <kbd aria-hidden="true" className="shortcut-hint" data-key="5" />
          </button>
          <button
            className="action"
            disabled={composerDisabled}
            onClick={() => openSheet({ kind: "series", mode: "time" })}
            type="button"
          >
            <Stopwatch className="action-icon" size={20} />
            <span>Spielzeit</span>
            <kbd aria-hidden="true" className="shortcut-hint" data-key="6" />
          </button>
          <button
            className="action"
            disabled={composerDisabled}
            onClick={() => setTimeoutTeam(possessionName)}
            type="button"
          >
            <Clock className="action-icon" size={20} />
            <span>Auszeit</span>
            {possessionTimeouts === null ? null : (
              <span aria-hidden="true" className="actioncount">
                {timeoutText(possessionTimeouts)}
              </span>
            )}
          </button>
          <button
            className={armed === "first" ? "action is-armed" : "action"}
            disabled={composerDisabled}
            onClick={() => tapSeriesTile("first", true)}
            type="button"
          >
            {armed === "first" ? (
              <User className="action-icon" size={20} />
            ) : (
              <ArrowRight className="action-icon" size={20} />
            )}
            <span>{armed === "first" ? "Nr. ergänzen" : "1st Down"}</span>
            <kbd aria-hidden="true" className="shortcut-hint" data-key="8" />
          </button>
          <button
            className="action"
            disabled={composerDisabled}
            onClick={() => tapSeriesTile("turnover", true)}
            type="button"
          >
            <SwapArrows className="action-icon" size={20} />
            <span>Turnover</span>
            <kbd aria-hidden="true" className="shortcut-hint" data-key="9" />
          </button>
          <button
            className="action"
            disabled={composerDisabled}
            onClick={() => openSheet({ kind: "more", mode: "safety" })}
            type="button"
          >
            <Shield className="action-icon" size={20} />
            <span>Safety</span>
            <kbd aria-hidden="true" className="shortcut-hint" data-key="0" />
          </button>
          <button
            className={armed === "overtime" ? "action is-armed" : "action"}
            disabled={composerDisabled}
            onClick={() => {
              if (overtime) {
                openSinglePat();
              } else if (armed === "overtime") {
                void startOvertime();
              } else {
                arm("overtime");
              }
            }}
            type="button"
          >
            <PlusCircle className="action-icon" size={20} />
            <span>
              {overtime
                ? "+1 XP"
                : armed === "overtime"
                  ? "Overtime starten"
                  : "Overtime"}
            </span>
          </button>
        </div>
      </section>
        <div
          aria-label="Spielabschluss"
          className={
            possessionSide === null
              ? "tracking-end"
              : `tracking-end ${possessionSide}`
          }
          role="group"
        >
        {log.isFirstHalf && !finished ? (
        <section aria-label="Halbzeit" className="halfblock">
          <button
            className="halfbtn"
            disabled={halftimeDisabled}
            onClick={() => {
              setHalftimeError(null);
              setHalftimeOpen(true);
            }}
            type="button"
          >
            <Pause size={18} />
            {halftimePending ? "Halbzeit …" : "Halbzeit"}
          </button>
          {halftimeError === null || halftimeOpen ? null : (
            <p className="trackerror" role="alert">
              {halftimeError}
            </p>
          )}
        </section>
      ) : breakStartedAt !== null && !finished ? (
        // The break lives in its dialog; this only reopens it without putting
        // a second countdown next to "Spiel beenden".
        <section aria-label="Halbzeitpause" className="halfblock">
          <button
            className="halfbtn"
            onClick={() => setHalftimeOpen(true)}
            type="button"
          >
            <Pause size={18} />
            Pause
          </button>
        </section>
      ) : null}
      <footer className="trackfoot">
        {finished ? null : (
          <button
            className="startbtn"
            disabled={readOnly}
            onClick={finish}
            type="button"
          >
            <Check size={20} />
            Spiel beenden
          </button>
        )}
        {finishBlocked ? (
          <p className="trackerror" role="alert">
            Extrapunkt nach dem Touchdown noch offen – bitte oben eintragen
            oder „nicht verwandelt“ wählen.
          </p>
        ) : null}
      </footer>
        </div>
        <p aria-live="polite" className="sr-only">
          {armed === "overtime"
            ? "Zum Bestätigen erneut tippen"
            : ""}
        </p>
      </main>

      {patTry !== null ? (
        <Sheet
          busy={patBusy}
          error={patError}
          footer={
            <button
              className="startbtn"
              disabled={patBusy || readOnly}
              onClick={() => {
                void writePat(patJersey);
              }}
              type="button"
            >
              {patBusy ? "Speichern …" : "Speichern"}
            </button>
          }
          onBack={() => {
            setPatTry(null);
            setPatError(null);
          }}
          onClose={() => {
            setPatTry(null);
            setPatError(null);
          }}
          title={`Extrapunkt ${patTry.team}`}
        >
          <p className="sheetnote">
            {patTry.defaultJersey === null
              ? "Wer hat den Extrapunkt verwandelt?"
              : `Wer hat den Extrapunkt verwandelt? Der Touchdown-Schütze ist vorausgewählt (#${patTry.defaultJersey}).`}
          </p>
          <JerseyPicker
            disabled={patBusy || readOnly}
            groupLabel="Trikotnummer Extrapunkt"
            label="Trikot"
            onChange={setPatJersey}
            optionalLabel="Ohne Nummer"
            players={patPlayers}
            strict={game.passcheck === true}
            value={patJersey}
          />
          <h3 className="sheetsection">Quarterback</h3>
          <QuarterbackPick
            disabled={patBusy || readOnly}
            onChange={setPatQb}
            roster={roster}
            side={patSide}
            value={patQb}
          />
        </Sheet>
      ) : null}

      {patDefense ? (
        <Sheet
          busy={patBusy}
          error={patError}
          footer={
            <button
              className="startbtn"
              disabled={patBusy || readOnly}
              onClick={() => {
                void writeDefensiveTry(patDefenseJersey);
              }}
              type="button"
            >
              {patBusy ? "Speichern …" : "Speichern"}
            </button>
          }
          onBack={() => {
            setPatDefense(false);
            setPatError(null);
          }}
          onClose={() => {
            setPatDefense(false);
            setPatError(null);
          }}
          title={`Gegner +2 · ${opponentName ?? "Gegner"}`}
        >
          <p className="sheetnote">
            Wer hat den Punkt für {opponentName ?? "Gegner"} erzielt? Ohne
            Nummer zählt der Punkt fürs Team.
          </p>
          <JerseyPicker
            disabled={patBusy || readOnly}
            groupLabel="Trikotnummer Gegner"
            label="Trikot"
            onChange={setPatDefenseJersey}
            optionalLabel="Ohne Nummer"
            players={patDefensePlayers}
            strict={game.passcheck === true}
            value={patDefenseJersey}
          />
        </Sheet>
      ) : null}

      {patMiss !== null ? (
        <MissedPatSheet
          initialJersey={patMiss.defaultJersey}
          lastQuarterback={patQb}
          onBack={() => setPatMiss(null)}
          onClose={() => setPatMiss(null)}
          onSubmit={writeMissedPat}
          opponentName={opponentName ?? "Gegner"}
          roster={roster}
          side={patSideOf(patMiss.team)}
          teamName={patMiss.team}
        />
      ) : null}

      {editing !== null ? (
        <EditSheet
          // A second edit of another row starts from that row, not the last one.
          key={editing.key}
          event={editing.event}
          half={editing.half}
          input={editing.input}
          jersey={editing.player}
          payload={editing.payload}
          onSubmit={submitEdit}
          onClose={() => setEditing(null)}
          roster={roster}
          side={
            editing.team !== null && editing.team === log.away.name
              ? "away"
              : "home"
          }
          teamName={editing.team ?? "–"}
        />
      ) : null}

      {sheet !== null &&
      possessionSide !== null &&
      possessionName !== null &&
      (sheet.kind === "touchdown" ||
        sheet.kind === "series" ||
        sheet.kind === "quarterback" ||
        sheet.kind === "spielzug" ||
        opponentName !== null) ? (
        sheet.kind === "play" ? (
          <PlaySheet
            drive={drive}
            geometry={geometry}
            initialResult={sheet.result}
            initialType={sheet.type}
            lastQuarterback={readQuarterback(game.id, possessionSide)}
            onBack={sheetHistory.length > 0 ? backSheet : undefined}
            onClose={closeSheet}
            onSubmit={submitPlay}
            opponentName={opponentName ?? "Gegner"}
            roster={roster}
            side={possessionSide}
            teamName={possessionName}
          />
        ) : sheet.kind === "fieldpos" ? (
          <FieldPositionSheet
            ballOn={drive.ballOn}
            down={drive.down}
            goal={drive.goal}
            onBack={sheetHistory.length > 0 ? backSheet : undefined}
            onClose={closeSheet}
            onSubmit={(event) => submit([event])}
            teamName={possessionName}
          />
        ) : sheet.kind === "challenge" ? (
          <ChallengeSheet
            onBack={sheetHistory.length > 0 ? backSheet : undefined}
            onClose={closeSheet}
            onSubmit={(event) => submit([event])}
            teamName={possessionName}
          />
        ) : sheet.kind === "touchdown" ? (
          <TouchdownSheet
            gain={touchdownGain}
            onClose={closeSheet}
            onSubmit={submitTouchdown}
            passcheck={game.passcheck === true}
            recent={recentJerseys}
            roster={roster}
            side={possessionSide}
            teamName={possessionName}
          />
        ) : sheet.kind === "series" ? (
          // Completing a one-tap interception: the defender already has the
          // ball, so the sheet sees the possession from before the tap.
          replacing !== null &&
          sheet.mode === "interception" &&
          opponentName !== null &&
          opponentSide !== null ? (
            <SeriesSheet
              key={sheet.mode}
              half={half}
              mode={sheet.mode}
              onBack={sheetHistory.length > 0 ? backSheet : undefined}
              onClose={closeSheet}
              onSubmit={submitSeries}
              opponentName={possessionName}
              perHalf={timeoutsPerHalf}
              roster={roster}
              side={opponentSide}
              teamName={opponentName}
              timeouts={timeouts}
            />
          ) : (
            <SeriesSheet
              key={sheet.mode}
              half={half}
              mode={sheet.mode}
              onBack={sheetHistory.length > 0 ? backSheet : undefined}
              onClose={closeSheet}
              onSubmit={submitSeries}
              opponentName={opponentName ?? "–"}
              perHalf={timeoutsPerHalf}
              roster={roster}
              side={possessionSide}
              teamName={possessionName}
              timeouts={timeouts}
            />
          )
        ) : sheet.kind === "penalty" ? (
          <PenaltySheet
            ballOn={drive.ballOn}
            history={unsportsmanlike}
            rules={rules}
            onClose={closeSheet}
            onSubmit={submit}
            opponentName={opponentName ?? ""}
            roster={roster}
            side={possessionSide}
            teamName={possessionName}
          />
        ) : sheet.kind === "quarterback" ? (
          <QuarterbackSheet
            onClose={closeSheet}
            onSubmit={(jersey) =>
              setQuarterback(game.id, possessionSide, jersey)
            }
            roster={roster}
            side={possessionSide}
            teamName={possessionName}
            value={readQuarterback(game.id, possessionSide)}
          />
        ) : sheet.kind === "spielzug" ? (
          <SpielzugSheet
            disabled={composerDisabled}
            onClose={closeSheet}
            onPick={pickFromSpielzug}
            onPlay={(type, result) =>
              openSheet({ kind: "play", type, result })
            }
          />
        ) : (
          <MoreSheet
            key={sheet.mode}
            mode={sheet.mode}
            onBack={sheetHistory.length > 0 ? backSheet : undefined}
            onClose={closeSheet}
            onSubmit={submit}
            opponentName={opponentName ?? ""}
            roster={roster}
            side={possessionSide}
            teamName={possessionName}
          />
        )
      ) : null}

      {halftimeOpen ? (
        <HalftimeSheet
          away={logTeamName(officialLog.away) ?? "–"}
          awayScore={officialLog.away.score}
          busy={halftimePending}
          direction={(() => {
            const first = directionFromWire(setup?.direction ?? undefined);
            return first === "Nord" ? "Süd" : first === "Süd" ? "Nord" : null;
          })()}
          disabled={halftimeDisabled}
          error={halftimeError}
          home={logTeamName(officialLog.home) ?? "–"}
          homeScore={officialLog.home.score}
          intermissionMinutes={
            rules?.periods?.intermission_minutes ?? 2
          }
          onClose={() => setHalftimeOpen(false)}
          onSecondHalf={startSecondHalf}
          onStart={() => void startHalftime()}
          possession={
            secondHalfPossession(
              setup,
              logTeamName(log.home),
              logTeamName(log.away),
            ) ?? opponentName
          }
          setup={setup}
          startedAt={breakStartedAt}
        />
      ) : null}

      {timeoutTeam !== null ? (
        <TimeoutSheet
          disabled={readOnly}
          half={half}
          key={timeoutTeam}
          onSubmit={(gameTime) => takeTimeout(timeoutTeam, gameTime)}
          onClose={() => setTimeoutTeam(null)}
          onTeam={(team) => setTimeoutTeam(team)}
          opponentName={
            timeoutTeam === possessionName ? opponentName : possessionName
          }
          perHalf={timeoutsPerHalf}
          seconds={rules?.timeouts?.seconds ?? 60}
          teamName={timeoutTeam}
          timeouts={timeouts}
          used={
            timeoutBudget(rows, timeoutTeam, half, timeoutsPerHalf).used
          }
        />
      ) : null}
    </div>
  );
}
