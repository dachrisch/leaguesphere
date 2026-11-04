import { useRef, useState } from "react";

import type { GameLogEventInput } from "../../api/types";
import { errorMessage } from "./errors";
import Sheet from "./Sheet";

/**
 * The challenge row, exactly as the event store takes it.
 *
 * The text is optional — the official may just tap it — and it is the row's
 * visible detail, so the ticker and the report say what was challenged.
 */
export function challengeEvent(text: string): GameLogEventInput {
  const trimmed = text.trim();
  return trimmed === ""
    ? { name: "Challenge" }
    : { name: "Challenge", input: trimmed };
}

interface ChallengeSheetProps {
  teamName: string;
  onSubmit: (event: GameLogEventInput) => Promise<void>;
  onClose: () => void;
}

/** A coach's challenge: one tap can be enough, the reason is optional. */
export default function ChallengeSheet({
  teamName,
  onSubmit,
  onClose,
}: ChallengeSheetProps) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two synchronous taps must not both write a challenge.
  const saving = useRef(false);

  const save = async (): Promise<void> => {
    if (saving.current) {
      return;
    }
    saving.current = true;
    setPosting(true);
    setError(null);
    try {
      await onSubmit(challengeEvent(text));
      onClose();
    } catch (failure) {
      saving.current = false;
      setPosting(false);
      setError(
        errorMessage(
          failure,
          "Die Challenge konnte nicht gespeichert werden. Bitte erneut versuchen.",
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
          disabled={posting}
          onClick={() => void save()}
          type="button"
        >
          {posting ? "Speichern …" : "Challenge speichern"}
        </button>
      }
      onClose={onClose}
      title={`Challenge · ${teamName}`}
    >
      <p className="sheetnote">
        Der Text ist optional – er steht später im Spielverlauf und im Ticker.
      </p>
      <div className="sheetfield">
        <label className="sheetlabel" htmlFor="challenge-text">
          Was wird gechallenget? (optional)
        </label>
        <input
          autoComplete="off"
          className="sheetinput"
          disabled={posting}
          id="challenge-text"
          onChange={(event) => setText(event.target.value)}
          type="text"
          value={text}
        />
      </div>
    </Sheet>
  );
}
