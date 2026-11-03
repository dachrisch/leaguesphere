import { useId, useRef, useState } from "react";

import type { GameLogEventInput, RosterPlayer } from "../../api/types";
import JerseyPicker, { jerseyOptions } from "../JerseyPicker";
import { errorMessage } from "./errors";
import Sheet from "./Sheet";

/**
 * Which detail of one log row the sheet corrects: the jersey, or the game
 * time of a clock entry.
 */
export type EditField = "jersey" | "clock";

/** The events whose correction is a jersey number. */
const JERSEY_EVENTS = new Set([
  "Touchdown",
  "1-Extra-Punkt",
  "2-Extra-Punkte",
  "Safety (+1)",
  "Safety (+2)",
  "Safety",
  "Overtime",
  "First Down",
  "Interception",
  "Strafe",
]);

/** Events that score only when they name a player (see the projector). */
const SCORING_EVENTS = new Set([
  "Touchdown",
  "1-Extra-Punkt",
  "2-Extra-Punkte",
  "Safety (+1)",
  "Safety (+2)",
  "Safety",
  "Overtime",
]);

export function editField(event: string): EditField {
  return JERSEY_EVENTS.has(event) ? "jersey" : "clock";
}

/** A scoring row must keep a number: without one the server stores 0 points. */
export function jerseyRequired(event: string): boolean {
  return SCORING_EVENTS.has(event);
}

/** `mm:ss` / `m:ss` → `[minutes, seconds]`; empty parts for anything else. */
export function parseClock(input: string | null): [string, string] {
  const [minutes = "", seconds = ""] = (input ?? "").split(":");
  return [
    /^\d{1,2}$/.test(minutes.trim()) ? minutes.trim() : "",
    /^\d{1,2}$/.test(seconds.trim()) ? seconds.trim() : "",
  ];
}

/**
 * The corrected event, ready to be written.
 *
 * The name stays the row's own event name, so a corrected touchdown is still a
 * touchdown; only the detail the officials mistyped changes. Free text the
 * event carries (a penalty's name) is kept.
 */
export function editEvent(
  event: string,
  {
    jersey = null,
    minutes = "",
    seconds = "",
    input = null,
  }: {
    jersey?: number | null;
    minutes?: string;
    seconds?: string;
    input?: string | null;
  } = {},
): GameLogEventInput {
  if (editField(event) === "clock") {
    return {
      name: event,
      input: `${minutes.padStart(2, "0")}:${seconds.padStart(2, "0")}`,
    };
  }
  const payload: GameLogEventInput = { name: event };
  if (jersey !== null) {
    payload.player = jersey;
  }
  if (input !== null && input !== "") {
    payload.input = input;
  }
  return payload;
}

interface EditSheetProps {
  /** The log row's event name (`Touchdown`, `Auszeit`, …). */
  event: string;
  /** The row's team, printed so the correction cannot hit the wrong side. */
  teamName: string;
  /** The row's half. */
  half: number;
  /** Side of the row's team, for the jersey list. */
  side: RosterPlayer["side"];
  /** Both sides as loaded from the API, `null` while the request runs. */
  roster: RosterPlayer[] | null;
  /** The stored jersey of the row. */
  jersey: number | null;
  /** The stored `input` of the row (clock text, penalty name). */
  input: string | null;
  onSubmit: (event: GameLogEventInput) => Promise<void>;
  onClose: () => void;
}

/**
 * Correct one log row: the jersey number, or the game time of Spielzeit and
 * Auszeit.
 *
 * The sheet writes a **new** event and the screen then undoes the old one, the
 * same correction path the log already uses. A row that the old app wrote
 * (no event `seq`) is not offered at all — there is nothing to correct.
 */
export default function EditSheet({
  event,
  teamName,
  half,
  side,
  roster,
  jersey,
  input,
  onSubmit,
  onClose,
}: EditSheetProps) {
  const field = editField(event);
  const [storedMinutes, storedSeconds] = parseClock(input);
  const [value, setValue] = useState<number | null>(jersey);
  const [minutes, setMinutes] = useState(storedMinutes);
  const [seconds, setSeconds] = useState(storedSeconds);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two synchronous taps must not both write a correction.
  const saving = useRef(false);
  const minutesId = useId();
  const secondsId = useId();

  const players =
    roster === null ? [] : roster.filter((player) => player.side === side);
  const options = jerseyOptions(players);
  const required = field === "jersey" && jerseyRequired(event);
  const clockMissing = field === "clock" && (minutes === "" || seconds === "");
  const ready = !posting && !clockMissing && (!required || value !== null);

  const save = async (): Promise<void> => {
    if (saving.current || !ready) {
      return;
    }
    saving.current = true;
    setPosting(true);
    setError(null);
    try {
      await onSubmit(
        editEvent(event, { jersey: value, minutes, seconds, input }),
      );
      onClose();
    } catch (failure) {
      saving.current = false;
      setPosting(false);
      setError(
        errorMessage(
          failure,
          "Die Änderung konnte nicht gespeichert werden. Bitte erneut versuchen.",
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
          {posting ? "Speichern …" : "Änderung speichern"}
        </button>
      }
      onClose={onClose}
      title={`${event} ändern`}
    >
      <p className="sheetnote">
        {teamName} · {half === 2 ? "2." : "1."} Halbzeit
      </p>

      {field === "clock" ? (
        <>
          <div className="timefields">
            <div className="sheetfield">
              <label className="sheetlabel" htmlFor={minutesId}>
                Minuten
              </label>
              <input
                autoComplete="off"
                className="sheetinput sheetinput-clock"
                disabled={posting}
                id={minutesId}
                inputMode="numeric"
                maxLength={2}
                onChange={(changeEvent) =>
                  setMinutes(changeEvent.target.value.replace(/\D/g, ""))
                }
                pattern="[0-9]*"
                type="text"
                value={minutes}
              />
            </div>
            <span aria-hidden="true" className="timesep">
              :
            </span>
            <div className="sheetfield">
              <label className="sheetlabel" htmlFor={secondsId}>
                Sekunden
              </label>
              <input
                autoComplete="off"
                className="sheetinput sheetinput-clock"
                disabled={posting}
                id={secondsId}
                inputMode="numeric"
                maxLength={2}
                onChange={(changeEvent) =>
                  setSeconds(changeEvent.target.value.replace(/\D/g, ""))
                }
                pattern="[0-9]*"
                type="text"
                value={seconds}
              />
            </div>
          </div>
          <p className="sheetnote">
            Restliche Spielzeit, als der Eintrag gemacht wurde – mm:ss.
          </p>
        </>
      ) : roster === null || options.length === 0 ? (
        <p className="sheetnote">
          Kein Kader geladen – die Nummer kann nicht geändert werden.
        </p>
      ) : (
        <>
          <h3 className="sheetsection">
            {required ? "Trikotnummer" : "Trikotnummer (optional)"}
          </h3>
          <JerseyPicker
            disabled={posting}
            groupLabel="Trikotnummer"
            label="Trikot"
            onChange={setValue}
            optionalLabel={required ? undefined : "Ohne Nummer"}
            players={players}
            value={value}
          />
        </>
      )}

    </Sheet>
  );
}
