import { useRef, useState } from "react";

import type { GameLogEventInput, RosterPlayer } from "../../api/types";
import JerseyPicker from "../JerseyPicker";
import { errorMessage } from "./errors";
import Sheet from "./Sheet";

/** Which "more events" entry the sheet is showing. */
export type MoreMode = "safety" | "overtime";

/** Safety is worth one or two points; v1 defaulted to two. */
export type SafetyPoints = 1 | 2;

const TITLES: Record<MoreMode, string> = {
  safety: "Safety",
  overtime: "Overtime",
};

/**
 * The team the event is recorded for.
 *
 * A safety is scored **by the defense**: the row belongs to the opponent of
 * the team in possession, which is exactly how v1 sent it
 * (`isOpponentAction=true`) and how the statistics read it. An overtime
 * touchdown belongs to the team that had the ball.
 */
export function moreTeam(
  mode: MoreMode,
  teamName: string,
  opponentName: string,
): string {
  return mode === "safety" ? opponentName : teamName;
}

/** Payload of one more-events entry; both always name a player. */
export function moreEvent(
  mode: MoreMode,
  jersey: number,
  points: SafetyPoints,
): GameLogEventInput {
  if (mode === "overtime") {
    return { name: "Overtime", player: jersey };
  }
  return {
    name: points === 1 ? "Safety (+1)" : "Safety (+2)",
    player: jersey,
  };
}

/** The sentence above the save button: what the write will record. */
export function moreSummary(
  mode: MoreMode,
  jersey: number | null,
  points: SafetyPoints,
  opponentName: string,
): string {
  if (jersey === null) {
    return "Spieler wählen, dann speichern.";
  }
  if (mode === "overtime") {
    return `Overtime #${jersey}`;
  }
  const score = points === 1 ? "1 Punkt" : `${points} Punkte`;
  return `Safety · ${score} für ${opponentName}`;
}

interface MoreSheetProps {
  mode: MoreMode;
  /** Possession team as the API knows it. */
  teamName: string;
  /** The other team; the safety's points land here. */
  opponentName: string;
  /** Side of the possession team. */
  side: RosterPlayer["side"];
  /**
   * Both sides as loaded from `GET /api/game/<id>/roster`, `null` while the
   * request is still running.
   */
  roster: RosterPlayer[] | null;
  /**
   * Writes the event for the given team and resolves once the server
   * answered. Rejects on failure — the sheet stays open and shows the message.
   */
  onSubmit: (events: GameLogEventInput[], team: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Safety and overtime entry, the two events that always name a player.
 *
 * The jersey is **required**, unlike First Down: both events score points and
 * the server stores value 0 for a scoring row without a player, so a save
 * without a number would look like a recorded safety that never reached the
 * score.
 */
export default function MoreSheet({
  mode,
  teamName,
  opponentName,
  side,
  roster,
  onSubmit,
  onClose,
}: MoreSheetProps) {
  const [jersey, setJersey] = useState<number | null>(null);
  const [points, setPoints] = useState<SafetyPoints>(2);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // See TouchdownSheet: two synchronous taps must not both reach onSubmit.
  const saving = useRef(false);

  const safety = mode === "safety";
  const jerseySide: RosterPlayer["side"] = safety
    ? side === "home"
      ? "away"
      : "home"
    : side;
  const displayTeam = safety ? opponentName : teamName;
  const players =
    roster === null
      ? []
      : roster.filter((player) => player.side === jerseySide);
  const loading = roster === null;
  const ready = jersey !== null && !posting && !loading;

  const save = async (): Promise<void> => {
    if (saving.current || !ready || jersey === null) {
      return;
    }
    saving.current = true;
    setPosting(true);
    setError(null);
    try {
      await onSubmit(
        [moreEvent(mode, jersey, points)],
        moreTeam(mode, teamName, opponentName),
      );
      onClose();
    } catch (failure) {
      saving.current = false;
      setPosting(false);
      setError(
        errorMessage(
          failure,
          "Der Eintrag konnte nicht gespeichert werden. Bitte erneut versuchen.",
        ),
      );
    }
  };

  return (
    <Sheet
      busy={posting}
      error={error}
      footer={
        <button
          className="startbtn"
          disabled={!ready}
          onClick={() => void save()}
          type="button"
        >
          {posting
            ? "Speichern …"
            : jersey === null
              ? "Spieler wählen"
              : "Speichern"}
        </button>
      }
      onClose={onClose}
      title={TITLES[mode]}
    >
      <p className="sheetnote">
        {safety
          ? `Sicherheit gegen ${teamName} – ${points === 1 ? "1 Punkt" : `${points} Punkte`} für ${opponentName}.`
          : `Overtime ${teamName}`}
      </p>

      <h3 className="sheetsection">
        {safety ? `Trikotnummer ${opponentName}` : "Trikotnummer"}
      </h3>
      {loading ? (
        <p className="sheetnote" role="status">
          Kader lädt …
        </p>
      ) : (
        <JerseyPicker
          disabled={posting}
          label="Trikotnummer"
          onChange={setJersey}
          players={players}
          value={jersey}
        />
      )}

      {safety ? (
        <>
          <h3 className="sheetsection">Punkte</h3>
          <div aria-label="Punkte" className="patrow two" role="group">
            {([1, 2] as const).map((value) => (
              <button
                aria-pressed={points === value}
                className={points === value ? "pat sel" : "pat"}
                disabled={posting}
                key={value}
                onClick={() => setPoints(value)}
                type="button"
              >
                +{value}
              </button>
            ))}
          </div>
        </>
      ) : null}

      <p className="sheetnote">{moreSummary(mode, jersey, points, displayTeam)}</p>
    </Sheet>
  );
}
