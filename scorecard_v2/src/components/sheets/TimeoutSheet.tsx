import { useRef, useState } from "react";

import BreakCountdown from "../BreakCountdown";
import { clockDigits, clockInput, maxMinutes } from "./SeriesSheet";
import { errorMessage } from "./errors";
import Sheet from "./Sheet";

/** A timeout's default length from the definition (`timeouts.seconds`). */
export const TIMEOUT_SECONDS = 60;

interface TimeoutSheetProps {
  teamName: string;
  /** Timeouts this team already took this half. */
  used: number;
  /** The definition's `timeouts.per_half`. */
  perHalf: number;
  /** The definition's `timeouts.seconds`. */
  seconds?: number;
  disabled?: boolean;
  /** Writes the **Auszeit** row; the optional game time travels as its input. */
  onSubmit: (gameTime: string | null) => Promise<void>;
  onClose: () => void;
}

/**
 * The **Auszeit** dialog: a short entry form and the 60-second countdown.
 *
 * The game time is optional (one empty field counts as zero, both empty means
 * "no time given"). A team that has used its allowance gets a warning and has
 * to tap again — *field calls win*, but the foul is never a silent single tap
 * (Q2, 2026-11-08). The countdown is device-local: the app runs no clock and
 * the timeout itself is the game event.
 */
export default function TimeoutSheet({
  teamName,
  used,
  perHalf,
  seconds = TIMEOUT_SECONDS,
  disabled = false,
  onSubmit,
  onClose,
}: TimeoutSheetProps) {
  const [minutes, setMinutes] = useState("");
  const [secs, setSecs] = useState("");
  const [armed, setArmed] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);

  const exhausted = used >= perHalf;
  const given = minutes !== "" || secs !== "";
  const invalid =
    Number(minutes) > maxMinutes() || Number(secs) > 59;

  const save = async (): Promise<void> => {
    if (saving.current || posting || disabled || invalid) {
      return;
    }
    if (exhausted && !armed) {
      // Warn + second tap: the circle shows the exhausted state, the dialog
      // states the foul, and only a deliberate second tap records it.
      setArmed(true);
      return;
    }
    saving.current = true;
    setPosting(true);
    setError(null);
    try {
      await onSubmit(given ? clockInput(minutes, secs) : null);
      setStartedAt(Date.now());
    } catch (failure) {
      saving.current = false;
      setPosting(false);
      setError(
        errorMessage(
          failure,
          "Die Auszeit konnte nicht gespeichert werden. Bitte erneut versuchen.",
        ),
      );
    } finally {
      setPosting(false);
    }
  };

  if (startedAt !== null) {
    return (
      <Sheet onClose={onClose} title={`Auszeit ${teamName}`}>
        <p className="sheetnote">
          {used} von {perHalf} Auszeiten in dieser Halbzeit. Die Uhr läuft
          nur auf diesem Gerät; die Auszeit selbst steht im Spielverlauf.
        </p>
        <BreakCountdown
          doneLabel="Auszeit beenden"
          durationNote={`Die Auszeit dauert ${seconds} Sekunden.`}
          label="Auszeit"
          onDone={onClose}
          panelLabel="Auszeit"
          startedAt={startedAt}
          totalSeconds={seconds}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      busy={posting}
      error={error}
      footer={
        <button
          className="startbtn"
          disabled={posting || invalid || disabled}
          onClick={() => void save()}
          type="button"
        >
          {posting
            ? "Speichern …"
            : exhausted && !armed
              ? "Trotzdem erfassen"
              : exhausted
                ? "Auszeit erfassen (bestätigt)"
                : "Auszeit nehmen"}
        </button>
      }
      onClose={onClose}
      title={`Auszeit ${teamName}`}
    >
      <p className="sheetnote">
        {used} von {perHalf} Auszeiten in dieser Halbzeit genommen.
      </p>
      {exhausted ? (
        <p className="sheetwarn" role="alert">
          Keine Auszeit mehr in dieser Halbzeit. Eine weitere ist die Strafe
          „Auszeit ohne verbleibende Auszeit“ (5 Yards).
          {armed ? " Erneut tippen, um sie trotzdem zu erfassen." : ""}
        </p>
      ) : null}

      <h3 className="sheetsection">Restliche Spielzeit (optional)</h3>
      <div className="timefields">
        <div className="sheetfield">
          <label className="sheetlabel" htmlFor="timeout-minutes">
            Minuten
          </label>
          <input
            autoComplete="off"
            className="sheetinput sheetinput-clock"
            disabled={posting}
            id="timeout-minutes"
            inputMode="numeric"
            maxLength={2}
            onChange={(event) => {
              setMinutes(clockDigits(event.target.value));
              setArmed(false);
            }}
            pattern="[0-9]*"
            placeholder="00"
            type="text"
            value={minutes}
          />
        </div>
        <span aria-hidden="true" className="timesep">
          :
        </span>
        <div className="sheetfield">
          <label className="sheetlabel" htmlFor="timeout-seconds">
            Sekunden
          </label>
          <input
            autoComplete="off"
            className="sheetinput sheetinput-clock"
            disabled={posting}
            id="timeout-seconds"
            inputMode="numeric"
            maxLength={2}
            onChange={(event) => {
              setSecs(clockDigits(event.target.value));
              setArmed(false);
            }}
            pattern="[0-9]*"
            placeholder="00"
            type="text"
            value={secs}
          />
        </div>
      </div>
      {invalid ? (
        <p className="sheetwarn" role="alert">
          Minuten 00–59 und Sekunden 00–59.
        </p>
      ) : null}
      <p className="sheetnote">
        Leer heißt „keine Zeit angegeben“; ein leeres Feld zählt als 0.
      </p>
    </Sheet>
  );
}
