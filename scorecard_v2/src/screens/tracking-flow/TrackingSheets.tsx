import { readQuarterback, setQuarterback } from "../../app/quarterback";
import { timeoutBudget } from "../../app/timeouts";
import { directionFromWire } from "../../components/DirectionText";
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
import SeriesSheet from "../../components/sheets/SeriesSheet";
import Sheet from "../../components/sheets/Sheet";
import SpielzugSheet from "../../components/sheets/SpielzugSheet";
import TimeoutSheet from "../../components/sheets/TimeoutSheet";
import TouchdownSheet from "../../components/sheets/TouchdownSheet";
import { secondHalfPossession } from "./logic";
import type { TrackingPanelsProps } from "./TrackingPanels";

/**
 * The tracking screen's dialogs and sheets (PAT try/defense/miss, correction,
 * the action sheets, halftime and timeout), split out of `TrackingPanels` so
 * neither file passes the ~900-line exit. The JSX is the panel's former
 * overlay block, moved verbatim; `TrackingPanels` renders it at the same spot
 * inside the app shell, so the DOM is unchanged.
 */
export type TrackingSheetsProps = Pick<
  TrackingPanelsProps,
  "game" |
  "log" |
  "officialLog" |
  "setup" |
  "rules" |
  "roster" |
  "rows" |
  "possessionSide" |
  "opponentSide" |
  "possessionName" |
  "opponentName" |
  "halftimePending" |
  "readOnly" |
  "composerDisabled" |
  "halftimeDisabled" |
  "halftimeError" |
  "patError" |
  "drive" |
  "geometry" |
  "half" |
  "timeoutsPerHalf" |
  "timeouts" |
  "unsportsmanlike" |
  "touchdownGain" |
  "patSide" |
  "patPlayers" |
  "patDefensePlayers" |
  "recentJerseys" |
  "patTry" |
  "patMiss" |
  "patDefense" |
  "patDefenseJersey" |
  "patJersey" |
  "patQb" |
  "patBusy" |
  "sheet" |
  "sheetHistory" |
  "replacing" |
  "editing" |
  "timeoutTeam" |
  "halftimeOpen" |
  "breakStartedAt" |
  "logTeamName" |
  "submitEdit" |
  "setTimeoutTeam" |
  "openSheet" |
  "closeSheet" |
  "backSheet" |
  "submitPlay" |
  "submitSeries" |
  "pickFromSpielzug" |
  "takeTimeout" |
  "writePat" |
  "writeDefensiveTry" |
  "writeMissedPat" |
  "patSideOf" |
  "submit" |
  "submitTouchdown" |
  "startHalftime" |
  "startSecondHalf" |
  "setPatDefense" |
  "setPatDefenseJersey" |
  "setPatTry" |
  "setPatError" |
  "setPatJersey" |
  "setPatQb" |
  "setPatMiss" |
  "setEditing" |
  "setHalftimeOpen"
>;

export function TrackingSheets({
  game,
  log,
  officialLog,
  setup,
  rules,
  roster,
  rows,
  possessionSide,
  opponentSide,
  possessionName,
  opponentName,
  halftimePending,
  readOnly,
  composerDisabled,
  halftimeDisabled,
  halftimeError,
  patError,
  drive,
  geometry,
  half,
  timeoutsPerHalf,
  timeouts,
  unsportsmanlike,
  touchdownGain,
  patSide,
  patPlayers,
  patDefensePlayers,
  recentJerseys,
  patTry,
  patMiss,
  patDefense,
  patDefenseJersey,
  patJersey,
  patQb,
  patBusy,
  sheet,
  sheetHistory,
  replacing,
  editing,
  timeoutTeam,
  halftimeOpen,
  breakStartedAt,
  logTeamName,
  submitEdit,
  setTimeoutTeam,
  openSheet,
  closeSheet,
  backSheet,
  submitPlay,
  submitSeries,
  pickFromSpielzug,
  takeTimeout,
  writePat,
  writeDefensiveTry,
  writeMissedPat,
  patSideOf,
  submit,
  submitTouchdown,
  startHalftime,
  startSecondHalf,
  setPatDefense,
  setPatDefenseJersey,
  setPatTry,
  setPatError,
  setPatJersey,
  setPatQb,
  setPatMiss,
  setEditing,
  setHalftimeOpen,
}: TrackingSheetsProps) {
  return (
    <>
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
    </>
  );
}
