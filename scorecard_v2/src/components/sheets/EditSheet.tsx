import { useId, useRef, useState } from "react";

import type { GameLogEventInput, RosterPlayer } from "../../api/types";
import { FIELD_LENGTH, MIDFIELD, SERIES_START, formatYards } from "../../app/drive";
import JerseyPicker, { jerseyOptions } from "../JerseyPicker";
import { errorMessage } from "./errors";
import { fieldPositionEvent, spotValue, type FieldSide } from "./FieldPositionSheet";
import { playInput, type PlayType } from "./PlaySheet";
import Sheet from "./Sheet";
import { yardsValue } from "./yards";

/**
 * Which detail of one log row the sheet corrects.
 *
 * Every row the app wrote can be corrected - the meeting of 2026-11-05
 * (24:50-25:46) found rows an operator could only reset - so the field
 * follows what the row actually carries: a number, a clock, a free text, a
 * play's yards or the spot.
 */
export type EditField = "jersey" | "clock" | "text" | "play" | "fieldpos";

/** Rows whose detail is the game time of the entry. */
const CLOCK_EVENTS = new Set(["Spielzeit", "Auszeit"]);

/** Rows whose detail is free text. */
const TEXT_EVENTS = new Set(["Challenge", "Turnover"]);

/** Rows that carry a scrimmage play. */
const PLAY_EVENTS = new Set(["Pass", "Pass unvollständig", "Run", "Sack"]);

const FIELD_EVENT = "Feldposition";

export function editField(event: string): EditField {
  if (CLOCK_EVENTS.has(event)) {
    return "clock";
  }
  if (PLAY_EVENTS.has(event)) {
    return "play";
  }
  if (TEXT_EVENTS.has(event)) {
    return "text";
  }
  if (event === FIELD_EVENT) {
    return "fieldpos";
  }
  return "jersey";
}

/**
 * Whether a scoring row needs a number.
 *
 * Not any more: since the score belongs to the team (IFAF R 8-1-1), a jersey
 * is optional detail even on a touchdown. Kept as a function because the
 * sheet and its callers ask the question by name.
 */
export function jerseyRequired(): boolean {
  // Since the score belongs to the team (IFAF R 8-1-1) no row needs a number.
  return false;
}

/** The play type a row's event name stands for. */
export function playTypeOf(event: string): PlayType {
  if (event === "Run") {
    return "run";
  }
  if (event === "Sack") {
    return "sack";
  }
  return "pass";
}

/** `mm:ss` / `m:ss` → `[minutes, seconds]`; empty parts for anything else. */
export function parseClock(input: string | null): [string, string] {
  const [minutes = "", seconds = ""] = (input ?? "").split(":");
  return [
    /^\d{1,2}$/.test(minutes.trim()) ? minutes.trim() : "",
    /^\d{1,2}$/.test(seconds.trim()) ? seconds.trim() : "",
  ];
}

/** The payload keys a play carries, for rebuilding its text. */
function playPayload(payload: Record<string, unknown> | null | undefined): {
  qb: number | null;
  complete: boolean;
  defender: number | null;
  deflection: boolean;
} {
  const qb = typeof payload?.qb === "number" ? payload.qb : null;
  const complete = payload?.complete !== false;
  const defense = payload?.defense;
  const defender =
    typeof defense === "object" && defense !== null && "player" in defense
      ? Number((defense as { player?: unknown }).player) || null
      : null;
  const deflection =
    typeof defense === "object" &&
    defense !== null &&
    (defense as { deflection?: unknown }).deflection === true;
  return { qb, complete, defender, deflection };
}

/** The spot inside a **Feldposition** row (`ballOn`, own-goal-based). */
function spotOfPayload(payload: Record<string, unknown> | null | undefined): number {
  const ballOn = payload?.ballOn;
  return typeof ballOn === "number" && Number.isFinite(ballOn)
    ? ballOn
    : SERIES_START;
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
    payload = null,
    yards = null,
    spot = null,
    text = null,
  }: {
    jersey?: number | null;
    minutes?: string;
    seconds?: string;
    input?: string | null;
    payload?: Record<string, unknown> | null;
    yards?: number | null;
    side?: FieldSide;
    spot?: number | null;
    text?: string | null;
  } = {},
): GameLogEventInput {
  switch (editField(event)) {
    case "clock":
      return {
        name: event,
        input: `${minutes.padStart(2, "0")}:${seconds.padStart(2, "0")}`,
      };
    case "text": {
      const note = (text ?? input ?? "").trim();
      return note === "" ? { name: event } : { name: event, input: note };
    }
    case "fieldpos": {
      // `spot` is the absolute spot the sheet built from side + yard line;
      // without one the stored payload decides.
      const ballOn = spot ?? spotOfPayload(payload);
      const ownSide: FieldSide = ballOn > MIDFIELD ? "B" : "A";
      const own = ballOn > MIDFIELD ? FIELD_LENGTH - ballOn : ballOn;
      return fieldPositionEvent(ownSide, own);
    }
    case "play": {
      const value = yards ?? 0;
      const signed = event === "Sack" ? -Math.abs(value) : value;
      const previous = playPayload(payload);
      const complete = previous.complete;
      const nextPayload: Record<string, unknown> = { ...(payload ?? {}), yards: signed };
      return {
        name: event,
        player: jersey ?? undefined,
        input: playInput({
          type: playTypeOf(event),
          complete,
          yards: signed,
          qb: previous.qb,
          defender: previous.defender,
          deflection: previous.deflection,
        }),
        payload: nextPayload,
      };
    }
    default: {
      const next: GameLogEventInput = { name: event };
      if (jersey !== null) {
        next.player = jersey;
      }
      if (input !== null && input !== "") {
        next.input = input;
      }
      return next;
    }
  }
}

interface EditSheetProps {
  /** The log row's event name (`Touchdown`, `Pass`, …). */
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
  /** The structured detail of the row (yards, quarterback, spot). */
  payload?: Record<string, unknown> | null;
  onSubmit: (event: GameLogEventInput) => Promise<void>;
  onClose: () => void;
}

/**
 * Correct one log row.
 *
 * The sheet writes a **new** event and the screen then undoes the old one, the
 * same correction path the log already uses. A row that the old app wrote (no
 * event `seq`) is not offered at all - there is nothing to correct.
 */
export default function EditSheet({
  event,
  teamName,
  half,
  side,
  roster,
  jersey,
  input,
  payload = null,
  onSubmit,
  onClose,
}: EditSheetProps) {
  const field = editField(event);
  const [storedMinutes, storedSeconds] = parseClock(input);
  const [value, setValue] = useState<number | null>(jersey);
  const [minutes, setMinutes] = useState(storedMinutes);
  const [seconds, setSeconds] = useState(storedSeconds);
  const [text, setText] = useState(input ?? "");
  const storedSpot = spotOfPayload(payload);
  const storedOwn = storedSpot > MIDFIELD ? FIELD_LENGTH - storedSpot : storedSpot;
  const [spotSide, setSpotSide] = useState<FieldSide>(
    storedSpot > MIDFIELD ? "B" : "A",
  );
  const [spotText, setSpotText] = useState(formatYards(storedOwn));
  const [playYards, setPlayYards] = useState(
    String(Math.abs(Number(payload?.yards ?? 0)) || 0),
  );
  const [playLoss, setPlayLoss] = useState(Number(payload?.yards ?? 0) < 0);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two synchronous taps must not both write a correction.
  const saving = useRef(false);
  const minutesId = useId();
  const secondsId = useId();
  const textId = useId();
  const yardsId = useId();
  const spotId = useId();

  const players =
    roster === null ? [] : roster.filter((player) => player.side === side);
  const options = jerseyOptions(players);
  const required = field === "jersey" && jerseyRequired();
  const clockMissing = field === "clock" && (minutes === "" || seconds === "");
  const spotValueNumber = spotValue(spotText);
  const spotMissing = field === "fieldpos" && spotValueNumber === null;
  const spotOutOfRange =
    field === "fieldpos" &&
    spotValueNumber !== null &&
    (spotValueNumber < 0 || spotValueNumber > MIDFIELD);
  const ready =
    !posting &&
    !clockMissing &&
    !spotMissing &&
    !spotOutOfRange &&
    (!required || value !== null);

  const save = async (): Promise<void> => {
    if (saving.current || !ready) {
      return;
    }
    saving.current = true;
    setPosting(true);
    setError(null);
    try {
      await onSubmit(
        editEvent(event, {
          jersey: value,
          minutes,
          seconds,
          input,
          payload,
          // the sheet's loss switch is the sign the play sheet writes too
          yards: playLoss
            ? -(yardsValue(playYards) ?? 0)
            : (yardsValue(playYards) ?? 0),
          side: spotSide,
          spot:
            spotValueNumber === null
              ? null
              : Math.round(
                  (spotSide === "A"
                    ? spotValueNumber
                    : FIELD_LENGTH - spotValueNumber) * 10,
                ) / 10,
          text,
        }),
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
      ) : null}

      {field === "text" ? (
        <div className="sheetfield">
          <label className="sheetlabel" htmlFor={textId}>
            Text (optional)
          </label>
          <input
            autoComplete="off"
            className="sheetinput"
            disabled={posting}
            id={textId}
            onChange={(changeEvent) => setText(changeEvent.target.value)}
            type="text"
            value={text}
          />
        </div>
      ) : null}

      {field === "play" ? (
        <>
          <h3 className="sheetsection">Raumgewinn / Verlust</h3>
          <div aria-label="Raumrichtung" className="seg" role="group">
            <button
              aria-pressed={!playLoss}
              className={!playLoss ? "sel" : undefined}
              disabled={posting}
              onClick={() => setPlayLoss(false)}
              type="button"
            >
              Gewinn
            </button>
            <button
              aria-pressed={playLoss}
              className={playLoss ? "sel" : undefined}
              disabled={posting}
              onClick={() => setPlayLoss(true)}
              type="button"
            >
              Verlust
            </button>
          </div>
          <div className="sheetfield">
            <label className="sheetlabel" htmlFor={yardsId}>
              Yards
            </label>
            <input
              autoComplete="off"
              className="sheetinput sheetinput-num"
              disabled={posting}
              id={yardsId}
              inputMode="numeric"
              onChange={(changeEvent) => {
                if (changeEvent.target.value.includes("-")) {
                  setPlayLoss(true);
                }
                setPlayYards(changeEvent.target.value.replace(/\D/g, "").slice(0, 2));
              }}
              pattern="[0-9]*"
              type="text"
              value={playYards}
            />
          </div>
        </>
      ) : null}

      {field === "fieldpos" ? (
        <>
          <div aria-label="Feldhälfte" className="seg" role="group">
            <button
              aria-pressed={spotSide === "A"}
              className={spotSide === "A" ? "sel" : undefined}
              disabled={posting}
              onClick={() => setSpotSide("A")}
              type="button"
            >
              A · eigene
            </button>
            <button
              aria-pressed={spotSide === "B"}
              className={spotSide === "B" ? "sel" : undefined}
              disabled={posting}
              onClick={() => setSpotSide("B")}
              type="button"
            >
              B · gegnerische
            </button>
          </div>
          <div className="sheetfield">
            <label className="sheetlabel" htmlFor={spotId}>
              Yardlinie (0–25)
            </label>
            <input
              autoComplete="off"
              className="sheetinput sheetinput-num"
              disabled={posting}
              id={spotId}
              inputMode="decimal"
              onChange={(changeEvent) => setSpotText(changeEvent.target.value)}
              pattern="[0-9.,]*"
              type="text"
              value={spotText}
            />
          </div>
          {spotMissing || spotOutOfRange ? (
            <p className="sheetwarn" role="alert">
              Die Yardlinie liegt zwischen 0 und 25.
            </p>
          ) : null}
        </>
      ) : null}

      {field === "jersey" || field === "play" ? (
        roster === null || options.length === 0 ? (
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
        )
      ) : null}
    </Sheet>
  );
}
