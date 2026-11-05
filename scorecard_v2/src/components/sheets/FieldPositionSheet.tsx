import { useRef, useState } from "react";

import type { GameLogEventInput } from "../../api/types";
import {
  FIELD_LENGTH,
  MIDFIELD,
  SERIES_START,
  formatYards,
} from "../../app/drive";
import { errorMessage } from "./errors";
import Sheet from "./Sheet";

/** Which half of the 50-yard field the spot is on, as the officials call it. */
export type FieldSide = "A" | "B";

/** A yard line with one decimal (`4,5` / `4.5`); anything else is `null`. */
export function spotValue(raw: string): number | null {
  const normalised = raw.trim().replace(",", ".");
  if (normalised === "") {
    return null;
  }
  const value = Number(normalised);
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

/**
 * The event of one Feldposition row.
 *
 * `ballOn` is the machine value: the offence's own goal line is 0, midfield 25
 * and the opponent's goal line 50, so a play can simply add its yards. The
 * text is the visible detail ("A12", "B20").
 */
export function fieldPositionEvent(
  side: FieldSide,
  yards: number,
): GameLogEventInput {
  const ballOn = side === "A" ? yards : FIELD_LENGTH - yards;
  const text = `${side}${formatYards(yards)}`;
  return {
    name: "Feldposition",
    input: text,
    payload: { ballOn, input: text },
  };
}

interface FieldPositionSheetProps {
  teamName: string;
  /** The spot the drive is on, pre-filled (own-goal-based 0–50). */
  ballOn: number | null;
  onSubmit: (event: GameLogEventInput) => Promise<void>;
  onClose: () => void;
}

/**
 * Set the ball's spot: a kickoff, a turnover, a correction.
 *
 * A/B plus a yard number, in the language the officials use. The row it writes
 * is what the drive engine reads, so a reload keeps the spot. A spot before
 * the first entry is always A5.
 */
export default function FieldPositionSheet({
  teamName,
  ballOn,
  onSubmit,
  onClose,
}: FieldPositionSheetProps) {
  const current = ballOn ?? SERIES_START;
  const [side, setSide] = useState<FieldSide>(current > MIDFIELD ? "B" : "A");
  const [yards, setYards] = useState(
    formatYards(current > MIDFIELD ? FIELD_LENGTH - current : current),
  );
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two synchronous taps must not both write the row.
  const saving = useRef(false);

  const distance = spotValue(yards);
  const ready =
    !posting && distance !== null && distance >= 0 && distance <= MIDFIELD;

  const save = async (): Promise<void> => {
    if (saving.current || !ready || distance === null) {
      return;
    }
    saving.current = true;
    setPosting(true);
    setError(null);
    try {
      await onSubmit(fieldPositionEvent(side, distance));
      onClose();
    } catch (failure) {
      saving.current = false;
      setPosting(false);
      setError(
        errorMessage(
          failure,
          "Die Feldposition konnte nicht gespeichert werden. Bitte erneut versuchen.",
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
          {posting ? "Speichern …" : "Feldposition speichern"}
        </button>
      }
      onClose={onClose}
      title={`Feldposition · ${teamName}`}
    >
      <div aria-label="Feldhälfte" className="seg" role="group">
        <button
          aria-pressed={side === "A"}
          className={side === "A" ? "sel" : undefined}
          disabled={posting}
          onClick={() => setSide("A")}
          type="button"
        >
          A · eigene
        </button>
        <button
          aria-pressed={side === "B"}
          className={side === "B" ? "sel" : undefined}
          disabled={posting}
          onClick={() => setSide("B")}
          type="button"
        >
          B · gegnerische
        </button>
      </div>
      <div className="sheetfield">
        <label className="sheetlabel" htmlFor="field-yards">
          Yardlinie (0–25)
        </label>
        <input
          autoComplete="off"
          className="sheetinput sheetinput-num"
          disabled={posting}
          id="field-yards"
          inputMode="decimal"
          onChange={(event) => setYards(event.target.value)}
          pattern="[0-9.,]*"
          type="text"
          value={yards}
        />
      </div>
      {distance !== null && (distance < 0 || distance > MIDFIELD) ? (
        <p className="sheetwarn" role="alert">
          Die Yardlinie liegt zwischen 0 und 25.
        </p>
      ) : null}
    </Sheet>
  );
}
