import { useEffect, useRef, useState } from "react";

import { ApiError, apiPut } from "../api/client";
import type { Game, GameLog, GameLogTeam, RosterPlayer } from "../api/types";
import FinalScore from "../components/FinalScore";
import Screen from "../components/Screen";
import SyncBadge, { SyncDetails } from "../components/SyncBadge";
import { errorMessage } from "../components/sheets/errors";
import { cachedGet, snapshotKey } from "../offline/snapshot";
import { useSyncStatus } from "../session/useSyncStatus";

interface FinalizeScreenProps {
  game: Game;
  log: GameLog;
  /** Outbox entries still waiting for the server — the finalise guard. */
  pendingWrites: number;
  /** Outbox entries the server rejected. They exist locally but not server-side. */
  failedWrites: number;
  /** Back to tracking — the "Spielstand bearbeiten" link. */
  onBack: () => void;
  /** Called with the log once the server accepted the result. */
  onFinalized: (log: GameLog) => void;
  /**
   * Called on a `409` when the game may already be finished on the server
   * (another device, a lost answer). Resolves with the log to show on the
   * result screen, or `null` when the conflict is something else.
   */
  onFinalizeConflict?: () => Promise<GameLog | null>;
  /** Header chrome owned by the flow. */
  onLogout?: () => void;
}

type Side = "home" | "away";

const SIDES: readonly Side[] = ["home", "away"];

/** `GameFinalizer` echo; the screen only needs the write to have succeeded. */
interface FinalizeEcho {
  homeCaptain?: string;
  awayCaptain?: string;
  note?: string;
}

function teamLabel(team: GameLogTeam, fallback: string | null): string {
  const name = team.name?.trim() ?? "";
  if (name !== "") {
    return name;
  }
  const other = fallback?.trim() ?? "";
  return other === "" ? "–" : other;
}

/**
 * Surname suggestions for one side.
 *
 * The roster already sends a display name per player (`last_name or
 * first_name`), so it can be offered verbatim. There is no captain flag on
 * `Playerlist` and the two stored captain fields are free text: the datalist
 * proposes names, it never decides who the captain is.
 */
export function surnameOptions(
  roster: RosterPlayer[] | null,
  side: Side,
): string[] {
  const names = new Set<string>();
  for (const player of roster ?? []) {
    if (player.side !== side) {
      continue;
    }
    const name = player.name?.trim();
    if (name !== undefined && name !== "") {
      names.add(name);
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right, "de"));
}

/** The reason shown while queued writes have not reached the server yet. */
export function pendingReason(count: number): string {
  return count === 1
    ? "1 Eintrag wartet auf Übertragung"
    : `${count} Einträge warten auf Übertragung`;
}

/** The reason shown while the server rejected writes the device still holds. */
export function rejectedReason(count: number): string {
  return count === 1 ? "1 Eintrag abgelehnt" : `${count} Einträge abgelehnt`;
}

/**
 * Finalise: confirm both captains, add an optional note, send the result.
 *
 * The confirmation is the official's statement that the captain was present —
 * not a signature, so it is a plain toggle until the request is sent. Nothing
 * is written before the submit: the two names and the note live here only, and
 * go out in one `PUT /finalize` together with the server's own score.
 *
 * The submit is blocked while the outbox is non-empty. A result sent with
 * events still on the device would be the final word on a game whose log is
 * incomplete, and nothing would ever reconcile it.
 */
export default function FinalizeScreen({
  game,
  log,
  pendingWrites,
  failedWrites,
  onBack,
  onFinalized,
  onFinalizeConflict,
  onLogout,
}: FinalizeScreenProps) {
  const [roster, setRoster] = useState<RosterPlayer[] | null>(null);
  const [captains, setCaptains] = useState<Record<Side, string>>({
    home: "",
    away: "",
  });
  const [confirmed, setConfirmed] = useState<Record<Side, boolean>>({
    home: false,
    away: false,
  });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One read of the outbox for the chip and its details, not one each.
  const status = useSyncStatus(game.id);
  // A ref, not state: two taps in the same tick both read the old state and
  // would send the result twice.
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    // Suggestions only. A failed read leaves the fields free text — the
    // captain's name is written by the official, not by the roster.
    cachedGet<RosterPlayer[]>(snapshotKey.roster(game.id), `/api/game/${game.id}/roster`)
      .then((players) => {
        if (active) {
          setRoster(players ?? []);
        }
      })
      .catch(() => {
        if (active) {
          setRoster([]);
        }
      });
    return () => {
      active = false;
    };
  }, [game.id]);

  const bothConfirmed = confirmed.home && confirmed.away;
  const anyConfirmed = confirmed.home || confirmed.away;
  // The result is the one write that may never be queued: it closes the game
  // for everyone else, so it needs the server now.
  const offline = globalThis.navigator?.onLine === false;
  const writeReasons = [
    pendingWrites > 0 ? pendingReason(pendingWrites) : null,
    failedWrites > 0 ? rejectedReason(failedWrites) : null,
    offline ? "Offline – das Ergebnis lässt sich erst online senden" : null,
  ].filter((reason): reason is string => reason !== null);
  const submitDisabled = saving || !bothConfirmed || writeReasons.length > 0;
  const describedBy = [
    writeReasons.length > 0 ? "finalize-writes" : null,
    bothConfirmed ? null : "finalize-confirm",
  ]
    .filter((id): id is string => id !== null)
    .join(" ");

  const setCaptain = (side: Side, value: string): void => {
    setCaptains((current) => ({ ...current, [side]: value }));
  };

  const toggleConfirmed = (side: Side): void => {
    // Confirming an empty field would confirm nobody.
    if (!confirmed[side] && captains[side].trim() === "") {
      return;
    }
    setConfirmed((current) => ({ ...current, [side]: !current[side] }));
  };

  const submit = async (): Promise<void> => {
    if (inFlight.current || submitDisabled) {
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      await apiPut<FinalizeEcho>(`/api/game/${game.id}/finalize`, {
        homeCaptain: captains.home.trim(),
        awayCaptain: captains.away.trim(),
        note,
      });
      onFinalized(log);
    } catch (failure) {
      // A 409 can mean the game is already finished (another device sent the
      // result, or an earlier answer was lost). Re-read and show the result
      // instead of an error the official cannot act on.
      if (
        failure instanceof ApiError &&
        failure.status === 409 &&
        onFinalizeConflict !== undefined
      ) {
        const finished = await onFinalizeConflict();
        if (finished !== null) {
          onFinalized(finished);
          return;
        }
      }
      // 409 means the game is not in a state that allows an end (and 400 a bad
      // payload); both answer with the server's `detail`. The confirmations and
      // the note stay put so the retry does not repeat the work.
      setError(
        errorMessage(
          failure,
          "Das Spielende konnte nicht gesendet werden. Bitte erneut versuchen.",
        ),
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <Screen
      badge={<SyncBadge gameId={game.id} status={status} variant="inline" />}
      onBack={onBack}
      onLogout={onLogout}
      sub={`${teamLabel(log.home, game.home)} – ${teamLabel(
        log.away,
        game.away,
      )} · Bestätigung`}
      title="Spielende"
    >
      <div className="finalize">
        <FinalScore away={log.away} home={log.home} />

        {/* The guard below says "not yet"; the details are how the official
            gets there: resume a pause, retry or drop a rejected write — the
            same affordances the tracking screen offers. */}
        <SyncDetails gameId={game.id} status={status} />

        <button
          className="editbtn"
          disabled={anyConfirmed || saving}
          onClick={onBack}
          type="button"
        >
          Spielstand bearbeiten
        </button>
        {anyConfirmed ? (
          <p className="setupnote">
            Ein Captain ist bestätigt – der Spielstand lässt sich nicht mehr
            bearbeiten. Bestätigung zurücknehmen, um zu ändern.
          </p>
        ) : null}

        <section aria-labelledby="captains-head" className="block">
          <div className="blockhead">
            <h2 id="captains-head">Captains</h2>
          </div>
          <p className="setupnote">
            Der Offizielle bestätigt, dass der Captain anwesend ist – keine
            Unterschrift. Vorschläge kommen aus dem Kader, jeder Name ist
            erlaubt.
          </p>
          {SIDES.map((side) => {
            const inputId = `captain-${side}`;
            const listId = `captain-${side}-suggestions`;
            const team = teamLabel(
              side === "home" ? log.home : log.away,
              side === "home" ? game.home : game.away,
            );
            const isConfirmed = confirmed[side];
            return (
              <div
                aria-label={`${team}: Captain`}
                className="captain"
                key={side}
                role="group"
              >
                <label className="captainteam" htmlFor={inputId}>
                  {team} <span className="captainsub">Captain</span>
                </label>
                <div className="captainrow">
                  <input
                    autoComplete="off"
                    className="sheetinput captaininput"
                    disabled={isConfirmed || saving}
                    id={inputId}
                    list={listId}
                    maxLength={100}
                    onChange={(event) => setCaptain(side, event.target.value)}
                    placeholder="Nachname"
                    spellCheck={false}
                    type="text"
                    value={captains[side]}
                  />
                  <datalist id={listId}>
                    {surnameOptions(roster, side).map((surname) => (
                      <option key={surname} value={surname} />
                    ))}
                  </datalist>
                  <button
                    aria-pressed={isConfirmed}
                    className="captainconfirm"
                    disabled={
                      saving ||
                      (!isConfirmed && captains[side].trim() === "")
                    }
                    onClick={() => toggleConfirmed(side)}
                    type="button"
                  >
                    {isConfirmed ? "Bestätigt" : "Bestätigen"}
                  </button>
                </div>
              </div>
            );
          })}
        </section>

        <section className="block">
          <label className="captainteam" htmlFor="game-note">
            Anmerkung <span className="captainsub">optional</span>
          </label>
          <textarea
            className="sheetinput finalnote"
            disabled={saving}
            id="game-note"
            onChange={(event) => setNote(event.target.value)}
            placeholder="z.B. DQ, längere Pause"
            rows={3}
            value={note}
          />
        </section>

        {writeReasons.length > 0 ? (
          <div className="setupwarn" id="finalize-writes" role="status">
            <b>Ergebnis noch nicht senden</b>
            {writeReasons.map((reason) => (
              <span key={reason}>{reason}</span>
            ))}
            <span>
              Erst übertragen, dann abschicken – sonst fehlt der Eintrag im
              Ergebnis.
            </span>
          </div>
        ) : null}

        {error === null ? null : (
          <div className="seterror" role="alert">
            <p>{error}</p>
          </div>
        )}

        <div className="finalfoot">
          {bothConfirmed ? null : (
            <p className="setupnote" id="finalize-confirm">
              Bitte beide Captains bestätigen.
            </p>
          )}
          <button
            aria-describedby={
              describedBy === "" ? undefined : describedBy
            }
            className="startbtn"
            disabled={submitDisabled}
            onClick={() => void submit()}
            type="button"
          >
            {saving ? "Sendet …" : "Ergebnis abschicken"}
          </button>
        </div>
      </div>
    </Screen>
  );
}
