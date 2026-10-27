import { useState } from "react";

import type { GameLogEventInput, RosterPlayer } from "../../api/types";
import JerseyPicker from "../JerseyPicker";
import Sheet, { errorMessage } from "./Sheet";

/** Conversion choice: 1, 2 or none (`+0`). */
export type Conversion = 0 | 1 | 2;

/**
 * Events of one touchdown submission.
 *
 * The server applies a scoring value only when `player` is set, so the
 * conversion repeats the touchdown's jersey — a `+1` row without a number
 * would silently score 0. `+0` sends the touchdown row alone: there is no
 * "missed conversion" event in the log.
 */
export function touchdownEvents(
  jersey: number,
  conversion: Conversion,
): GameLogEventInput[] {
  const events: GameLogEventInput[] = [{ name: "Touchdown", player: jersey }];
  if (conversion === 1) {
    events.push({ name: "1-Extra-Punkt", player: jersey });
  } else if (conversion === 2) {
    events.push({ name: "2-Extra-Punkte", player: jersey });
  }
  return events;
}

/** The sentence above the save button: what the two-row payload will be. */
export function touchdownSummary(
  jersey: number | null,
  conversion: Conversion,
): string {
  if (jersey === null) {
    return "Spieler wählen, dann speichern.";
  }
  const suffix =
    conversion === 1
      ? "1 Extrapunkt"
      : conversion === 2
        ? "2 Extrapunkte"
        : "ohne Extrapunkt";
  return `Touchdown #${jersey} · ${suffix}`;
}

interface TouchdownSheetProps {
  /** Possession team as the API knows it (the write body's `team`). */
  teamName: string;
  /** Side of the possession team; the roster is filtered by it. */
  side: RosterPlayer["side"];
  /** Both sides as loaded from `GET /api/game/<id>/roster`. */
  roster: RosterPlayer[];
  /** Only a fully checked game may call its roster "bestätigt". */
  passcheck?: boolean;
  /**
   * Writes the events and resolves once the server answered with the new log.
   * Rejects on failure — the sheet then stays open and shows the message.
   */
  onSubmit: (events: GameLogEventInput[]) => Promise<void>;
  /** Called after a successful write; the screen drops the sheet. */
  onClose: () => void;
}

/**
 * Touchdown entry: jersey from the possession team's roster, then the
 * conversion.
 *
 * The conversion defaults to one point (`1-Extra-Punkt`) like the old
 * scorecard; `+0` is explicit because the log has no "conversion missed" row.
 */
export default function TouchdownSheet({
  teamName,
  side,
  roster,
  passcheck = false,
  onSubmit,
  onClose,
}: TouchdownSheetProps) {
  const [jersey, setJersey] = useState<number | null>(null);
  const [conversion, setConversion] = useState<Conversion>(1);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const players = roster.filter((player) => player.side === side);
  const ready = jersey !== null && !posting;

  const save = async (): Promise<void> => {
    if (!ready || jersey === null) {
      return;
    }
    setPosting(true);
    setError(null);
    try {
      await onSubmit(touchdownEvents(jersey, conversion));
      onClose();
    } catch (failure) {
      setPosting(false);
      setError(
        errorMessage(
          failure,
          "Der Touchdown konnte nicht gespeichert werden. Bitte erneut versuchen.",
        ),
      );
    }
  };

  return (
    <Sheet
      error={error}
      footer={
        <button
          className="startbtn"
          disabled={!ready}
          onClick={() => void save()}
          type="button"
        >
          {posting ? "Speichert …" : jersey === null ? "Spieler wählen" : "Speichern"}
        </button>
      }
      onClose={onClose}
      title="Wer hat gepunktet?"
    >
      <p className="sheetnote">
        Touchdown {teamName}
        {passcheck ? " · bestätigter Kader" : ""}
      </p>

      <h3 className="sheetsection">
        {passcheck ? "Bestätigter Kader" : "Kader"}
      </h3>
      <JerseyPicker
        disabled={posting}
        onChange={setJersey}
        players={players}
        value={jersey}
      />
      {players.length === 0 ? null : (
        <p className="sheetnote">Nur bestätigte Nummern.</p>
      )}

      <h3 className="sheetsection">Extrapunkt</h3>
      <div aria-label="Extrapunkt" className="patrow" role="group">
        {([1, 2, 0] as const).map((value) => (
          <button
            aria-pressed={conversion === value}
            className={conversion === value ? "pat sel" : "pat"}
            disabled={jersey === null || posting}
            key={value}
            onClick={() => setConversion(value)}
            title={
              value === 0 ? "Ohne Extrapunkt" : `${value} Extrapunkt${value === 2 ? "e" : ""}`
            }
            type="button"
          >
            +{value}
          </button>
        ))}
      </div>

      <p className="sheetnote">{touchdownSummary(jersey, conversion)}</p>
    </Sheet>
  );
}
