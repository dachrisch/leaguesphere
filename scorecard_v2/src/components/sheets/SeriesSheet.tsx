import { useId, useRef, useState } from "react";

import type { GameLogEventInput, RosterPlayer } from "../../api/types";
import { jerseyOptions } from "../JerseyPicker";
import { errorMessage } from "./errors";
import Sheet from "./Sheet";

/** Which series/time entry the sheet is showing. */
export type SeriesMode =
  | "first"
  | "turnover"
  | "interception"
  | "time"
  | "timeout";

interface ModeInfo {
  title: string;
  /** Wire event name the server expects. */
  event: string;
  /** First Down and Interception may name a player, Turnover never does. */
  jersey: boolean;
}

const MODES: Record<SeriesMode, ModeInfo> = {
  first: { title: "First Down", event: "First Down", jersey: true },
  turnover: { title: "Turnover", event: "Turnover", jersey: false },
  interception: { title: "Interception", event: "Interception", jersey: true },
  time: { title: "Spielzeit", event: "Spielzeit", jersey: false },
  timeout: { title: "Auszeit", event: "Auszeit", jersey: false },
};

export function isTimeMode(mode: SeriesMode): boolean {
  return mode === "time" || mode === "timeout";
}

/** Largest first value the input allows: Spielzeit is mm:ss, Auszeit m:ss. */
export function maxMinutes(mode: SeriesMode): number {
  return mode === "time" ? 59 : 99;
}

/** Digits only, at most two of them. */
export function clockDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 2);
}

/**
 * Validation for the two time fields, in the sheet's language.
 *
 * Both fields are required: an empty minutes field is not "0 minutes" but an
 * unfinished entry, and the server would store the empty text as the row's
 * input.
 */
export function timeError(
  mode: SeriesMode,
  minutes: string,
  seconds: string,
): string | null {
  if (minutes === "" && seconds === "") {
    return "Bitte Minuten und Sekunden angeben.";
  }
  if (minutes === "") {
    return "Bitte Minuten angeben.";
  }
  if (seconds === "") {
    return "Bitte Sekunden angeben.";
  }
  if (Number(minutes) > maxMinutes(mode)) {
    return mode === "time"
      ? "Die Spielzeit muss zwischen 00:00 und 59:59 liegen."
      : "Die Auszeit muss zwischen 0:00 und 99:59 liegen.";
  }
  if (Number(seconds) > 59) {
    return "Sekunden müssen zwischen 0 und 59 liegen.";
  }
  return null;
}

/**
 * The `input` text of a time row: `mm:ss` for the remaining Spielzeit (the
 * log renders it next to the event name), `m:ss` for an Auszeit duration.
 */
export function clockInput(
  mode: SeriesMode,
  minutes: string,
  seconds: string,
): string {
  const secs = seconds.padStart(2, "0");
  return mode === "time"
    ? `${minutes.padStart(2, "0")}:${secs}`
    : `${Number(minutes)}:${secs}`;
}

/** Payload of a non-time series entry; `Turnover` never names a player. */
export function seriesEvent(
  mode: SeriesMode,
  jersey: number | null,
): GameLogEventInput {
  const { event, jersey: allowsJersey } = MODES[mode];
  return allowsJersey && jersey !== null
    ? { name: event, player: jersey }
    : { name: event };
}

/** Payload of a Spielzeit/Auszeit entry. */
export function timeEvent(
  mode: SeriesMode,
  minutes: string,
  seconds: string,
): GameLogEventInput {
  return { name: MODES[mode].event, input: clockInput(mode, minutes, seconds) };
}

interface SeriesSheetProps {
  mode: SeriesMode;
  /** Possession team — the side the entry is recorded for. */
  teamName: string;
  /** The other team; the defender of an interception. */
  opponentName: string;
  /** Side of the possession team. */
  side: RosterPlayer["side"];
  /**
   * Both sides as loaded from `GET /api/game/<id>/roster`, `null` while the
   * request is still running.
   */
  roster: RosterPlayer[] | null;
  /**
   * Writes the events and resolves once the server answered with the new log.
   * Rejects on failure — the sheet then stays open and shows the message.
   */
  onSubmit: (events: GameLogEventInput[]) => Promise<void>;
  onClose: () => void;
}

/**
 * One sheet for the five series and time entries.
 *
 * An interception is credited to the **defender** — the team that did not have
 * the ball — because the defense statistics read the row's team as the team
 * that made the play. The jersey list therefore comes from the opponent's
 * roster and the write payload names the opponent, not the passer.
 */
export default function SeriesSheet({
  mode,
  teamName,
  opponentName,
  side,
  roster,
  onSubmit,
  onClose,
}: SeriesSheetProps) {
  const info = MODES[mode];
  const time = isTimeMode(mode);
  const minutesId = useId();
  const secondsId = useId();

  const [jersey, setJersey] = useState<number | null>(null);
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [touched, setTouched] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // See TouchdownSheet: two synchronous taps must not both reach onSubmit.
  const saving = useRef(false);

  const intercepts = mode === "interception";
  const jerseySide: RosterPlayer["side"] = intercepts
    ? side === "home"
      ? "away"
      : "home"
    : side;
  const displayTeam = intercepts ? opponentName : teamName;

  const players =
    roster === null
      ? []
      : roster.filter((player) => player.side === jerseySide);
  const options = jerseyOptions(players);
  const loading = roster === null;
  const validation = time ? timeError(mode, minutes, seconds) : null;
  const ready = !posting && validation === null;

  const save = async (): Promise<void> => {
    if (saving.current || !ready) {
      return;
    }
    saving.current = true;
    setPosting(true);
    setError(null);
    try {
      await onSubmit(
        time ? [timeEvent(mode, minutes, seconds)] : [seriesEvent(mode, jersey)],
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
          {posting ? "Speichern …" : "Speichern"}
        </button>
      }
      onClose={onClose}
      title={info.title}
    >
      <p className="sheetnote">{displayTeam}</p>

      {time ? (
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
              onChange={(event) => {
                setMinutes(clockDigits(event.target.value));
                setTouched(true);
              }}
              pattern="[0-9]*"
              placeholder={mode === "time" ? "00" : "0"}
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
              onChange={(event) => {
                setSeconds(clockDigits(event.target.value));
                setTouched(true);
              }}
              pattern="[0-9]*"
              placeholder="00"
              type="text"
              value={seconds}
            />
          </div>
        </div>
      ) : null}

      {time ? (
        <p className="sheetnote">
          {mode === "time"
            ? "Restliche Spielzeit im laufenden Spiel – mm:ss."
            : "Dauer der Auszeit – m:ss."}
        </p>
      ) : null}

      {touched && validation !== null ? (
        <p className="sheetwarn" role="alert">
          {validation}
        </p>
      ) : null}

      {!time && info.jersey ? (
        <>
          <h3 className="sheetsection">
            {intercepts
              ? "Trikotnummer Verteidiger (optional)"
              : "Trikotnummer (optional)"}
          </h3>
          {loading ? (
            <p className="sheetnote" role="status">
              Kader lädt …
            </p>
          ) : players.length === 0 ? (
            <p className="sheetnote">
              Kein Kader geladen – der Eintrag wird ohne Nummer gespeichert.
            </p>
          ) : (
            <div
              aria-label={
                intercepts
                  ? "Trikotnummer Verteidiger (optional)"
                  : "Trikotnummer (optional)"
              }
              className="jerseychips"
              role="group"
            >
              <button
                aria-pressed={jersey === null}
                className={jersey === null ? "jerseychip sel" : "jerseychip"}
                disabled={posting}
                onClick={() => setJersey(null)}
                type="button"
              >
                Ohne Nummer
              </button>
              {options.map((option) => {
                const name = option.name?.trim() || null;
                return (
                  <button
                    aria-label={
                      name === null
                        ? `Trikot ${option.jersey}`
                        : `Trikot ${option.jersey}, ${name}`
                    }
                    aria-pressed={jersey === option.jersey}
                    className={
                      jersey === option.jersey
                        ? "jerseychip sel"
                        : "jerseychip"
                    }
                    disabled={posting}
                    key={option.jersey}
                    onClick={() => setJersey(option.jersey)}
                    type="button"
                  >
                    #{option.jersey}
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : null}

      {mode === "turnover" ? (
        <p className="sheetnote">
          Turnover {teamName}. Der Ballbesitz wechselt im Spielverlauf.
        </p>
      ) : null}

      {intercepts ? (
        <p className="sheetnote">
          Interception durch {opponentName}. Der Ballbesitz wechselt im
          Spielverlauf zu {opponentName}.
        </p>
      ) : null}
    </Sheet>
  );
}
