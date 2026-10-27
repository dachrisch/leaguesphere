import { useId, useState } from "react";

import type { GameLogEventInput, RosterPlayer } from "../../api/types";
import { jerseyOptions } from "../JerseyPicker";
import Sheet, { errorMessage } from "./Sheet";

/** Which series/time entry the sheet is showing. */
export type SeriesMode = "first" | "turnover" | "interception" | "time" | "timeout";

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
  side: RosterPlayer["side"];
  /** Both sides as loaded from `GET /api/game/<id>/roster`. */
  roster: RosterPlayer[];
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
 * Interceptions are recorded **for the possessing team** — that is the team
 * that threw the ball. The server marks the row as a change of possession
 * (`cop`), so the payload team must not be flipped here; sending the opponent
 * would charge the interception to the wrong side.
 */
export default function SeriesSheet({
  mode,
  teamName,
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

  const players = roster.filter((player) => player.side === side);
  const options = jerseyOptions(players);
  const validation = time ? timeError(mode, minutes, seconds) : null;
  const ready = !posting && validation === null;

  const save = async (): Promise<void> => {
    if (!ready) {
      return;
    }
    setPosting(true);
    setError(null);
    try {
      await onSubmit(
        time ? [timeEvent(mode, minutes, seconds)] : [seriesEvent(mode, jersey)],
      );
      onClose();
    } catch (failure) {
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
      error={error}
      footer={
        <button
          className="startbtn"
          disabled={!ready}
          onClick={() => void save()}
          type="button"
        >
          {posting ? "Speichert …" : "Speichern"}
        </button>
      }
      onClose={onClose}
      title={info.title}
    >
      <p className="sheetnote">{teamName}</p>

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
          <h3 className="sheetsection">Trikotnummer (optional)</h3>
          {players.length === 0 ? (
            <p className="sheetnote">
              Kein Kader geladen – der Eintrag wird ohne Nummer gespeichert.
            </p>
          ) : (
            <div
              aria-label="Trikotnummer (optional)"
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
          Turnover {teamName} – der Ballbesitz wechselt nach dem Eintrag.
        </p>
      ) : null}

      {mode === "interception" ? (
        <p className="sheetnote">
          Interception durch {teamName}. Der Ballbesitz wechselt zum Gegner.
        </p>
      ) : null}
    </Sheet>
  );
}
