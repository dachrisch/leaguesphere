import { useRef, useState } from "react";

import type { GameLogEventInput } from "../../api/types";
import { errorMessage } from "./errors";
import Sheet from "./Sheet";
import { yardsValue } from "./yards";

/** Which half of the field the spot is on, as the officials call it. */
export type FieldSide = "own" | "opponent";

/**
 * The event of one Feldposition row.
 *
 * `ballOn` is the machine value: the offence's own goal line is 0 and the
 * opponent's is 100, so a play can simply add its yards. The text is the
 * visible detail ("eigene 35", "gegn. 40").
 */
export function fieldPositionEvent(
  side: FieldSide,
  yards: number,
): GameLogEventInput {
  const ballOn = side === "own" ? yards : 100 - yards;
  const text =
    side === "own" ? `eigene ${yards}` : `gegn. ${yards}`;
  return {
    name: "Feldposition",
    input: text,
    payload: { ballOn, input: text },
  };
}

interface FieldPositionSheetProps {
  teamName: string;
  /** The spot the drive is on, pre-filled (own-based 0–100). */
  ballOn: number | null;
  onSubmit: (event: GameLogEventInput) => Promise<void>;
  onClose: () => void;
}

/**
 * Set the ball's spot: a kickoff, a turnover, a correction.
 *
 * Own/opponent plus a yard number, in the language the officials use. The row
 * it writes is what the drive engine reads, so a reload keeps the spot.
 */
export default function FieldPositionSheet({
  teamName,
  ballOn,
  onSubmit,
  onClose,
}: FieldPositionSheetProps) {
  const [side, setSide] = useState<FieldSide>(
    ballOn !== null && ballOn > 50 ? "opponent" : "own",
  );
  const [yards, setYards] = useState(
    ballOn === null
      ? "35"
      : String(ballOn <= 50 ? ballOn : 100 - ballOn),
  );
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two synchronous taps must not both write the row.
  const saving = useRef(false);

  const distance = yardsValue(yards);
  const ready = !posting && distance !== null && distance <= 50;

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
          aria-pressed={side === "own"}
          className={side === "own" ? "sel" : undefined}
          disabled={posting}
          onClick={() => setSide("own")}
          type="button"
        >
          eigene
        </button>
        <button
          aria-pressed={side === "opponent"}
          className={side === "opponent" ? "sel" : undefined}
          disabled={posting}
          onClick={() => setSide("opponent")}
          type="button"
        >
          gegnerische
        </button>
      </div>
      <div className="sheetfield">
        <label className="sheetlabel" htmlFor="field-yards">
          Yardlinie (0–50)
        </label>
        <input
          autoComplete="off"
          className="sheetinput sheetinput-num"
          disabled={posting}
          id="field-yards"
          inputMode="numeric"
          onChange={(event) => setYards(event.target.value)}
          pattern="[0-9]*"
          type="text"
          value={yards}
        />
      </div>
      {distance !== null && distance > 50 ? (
        <p className="sheetwarn" role="alert">
          Die Yardlinie liegt zwischen 0 und 50.
        </p>
      ) : null}
    </Sheet>
  );
}
