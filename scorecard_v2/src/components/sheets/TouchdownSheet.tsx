import { useRef, useState } from "react";

import type { GameLogEventInput, RosterPlayer } from "../../api/types";
import JerseyPicker, { jerseyAllowed, jerseyOptions } from "../JerseyPicker";
import { errorMessage } from "./errors";
import Sheet from "./Sheet";

/**
 * Events of one touchdown submission: the touchdown row alone. The extra
 * point is a separate entry once the try has been played (the tracking
 * screen asks for it), so the sheet never records a point that may not
 * happen.
 */
export function touchdownEvents(jersey: number): GameLogEventInput[] {
  return [{ name: "Touchdown", player: jersey }];
}

interface TouchdownSheetProps {
  /** Possession team as the API knows it (the write body's `team`). */
  teamName: string;
  /** Side of the possession team; the roster is filtered by it. */
  side: RosterPlayer["side"];
  /**
   * Both sides as loaded from `GET /api/game/<id>/roster`, `null` while the
   * request is still running. Until it settles the sheet shows a loading note
   * instead of guessing that the roster is empty.
   */
  roster: RosterPlayer[] | null;
  /** Only a fully checked game may call its roster "bestätigt". */
  passcheck?: boolean;
  /** Jerseys that already scored or moved the chains this game, newest first. */
  recent?: number[];
  /**
   * Writes the events and resolves once the server answered with the new log.
   * Rejects on failure — the sheet then stays open and shows the message.
   */
  onSubmit: (events: GameLogEventInput[]) => Promise<void>;
  /** Called after a successful write; the screen drops the sheet. */
  onClose: () => void;
}

/**
 * Touchdown entry: the scorer's jersey from the possession team's roster.
 * The extra point is not asked here; it is entered after the try.
 */
export default function TouchdownSheet({
  teamName,
  side,
  roster,
  passcheck = false,
  recent = [],
  onSubmit,
  onClose,
}: TouchdownSheetProps) {
  const [jersey, setJersey] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ref, not state: a synchronous double tap both see `posting === false`
  // before React re-renders, and the second submit would resolve immediately.
  const saving = useRef(false);

  const players =
    roster === null ? [] : roster.filter((player) => player.side === side);
  const loading = roster === null;
  const ready =
    jerseyAllowed(players, jersey, passcheck) && !posting && !loading;
  const names = new Map(
    jerseyOptions(players).map((option) => [option.jersey, option.name]),
  );
  const chips = recent.filter((number) => !passcheck || names.has(number)).slice(0, 4);

  const save = async (): Promise<void> => {
    if (saving.current || !ready || jersey === null) {
      return;
    }
    saving.current = true;
    setPosting(true);
    setError(null);
    try {
      await onSubmit(touchdownEvents(jersey));
      onClose();
    } catch (failure) {
      saving.current = false;
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
      busy={posting}
      error={error}
      footer={
        <button
          className="startbtn"
          disabled={!ready}
          onClick={() => void save()}
          type="button"
        >
          {posting ? "Speichern …" : jersey === null ? "Spieler wählen" : "Speichern"}
        </button>
      }
      onClose={onClose}
      title="Wer hat gepunktet?"
    >
      <p className="sheetnote">
        Touchdown {teamName}
        {passcheck ? " · bestätigter Kader" : ""}
      </p>

      {chips.length === 0 || loading ? null : (
        <JerseyPicker
          compact
          disabled={posting}
          groupLabel="Zuletzt"
          onChange={setJersey}
          players={chips.map((number) => ({
            side,
            jersey: number,
            name: names.get(number) ?? null,
          }))}
          value={jersey}
        />
      )}

      <h3 className="sheetsection">
        {passcheck ? "Bestätigter Kader" : "Kader"}
      </h3>
      {loading ? (
        <p className="sheetnote" role="status">
          Kader lädt …
        </p>
      ) : (
        <JerseyPicker
          disabled={posting}
          onChange={setJersey}
          players={players}
          strict={passcheck}
          value={jersey}
        />
      )}
      {passcheck && !loading && players.length > 0 ? (
        <p className="sheetnote">Nur bestätigte Nummern.</p>
      ) : null}

    </Sheet>
  );
}
