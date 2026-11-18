import { useState } from "react";

import type { RosterPlayer } from "../../api/types";
import JerseyPicker from "../JerseyPicker";
import Sheet from "./Sheet";

interface QuarterbackSheetProps {
  /** The team whose default is set, printed so the wrong side is obvious. */
  teamName: string;
  /** Side of that team, for the jersey list. */
  side: RosterPlayer["side"];
  /** Both sides as loaded from the API, `null` while the request runs. */
  roster: RosterPlayer[] | null;
  /** The stored default, or `null` before one was chosen. */
  value: number | null;
  /** Save the new default; `null` means "ask again on every pass". */
  onSubmit: (jersey: number | null) => Promise<void> | void;
  onClose: () => void;
}

/**
 * **QB**: who throws for this team from now on.
 *
 * The play sheet preselects the team's default and only changes it for the one
 * play (a trick play must not rewrite the default). The first stored number
 * therefore wins for the whole game — which left the officials without a way
 * out when the setup named the wrong passer (field report 2026-11-18). This
 * sheet is that way out: pick the number, and every following pass of the side
 * starts with it. "Ohne QB" clears the default so the wizard asks again.
 *
 * Nothing is written to the game log — the default is a typing aid on this
 * device, exactly like the remembered one.
 */
export default function QuarterbackSheet({
  teamName,
  side,
  roster,
  value,
  onSubmit,
  onClose,
}: QuarterbackSheetProps) {
  const [jersey, setJersey] = useState<number | null>(value);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const players =
    roster === null ? [] : roster.filter((player) => player.side === side);

  const save = async (): Promise<void> => {
    if (posting) {
      return;
    }
    setPosting(true);
    setError(null);
    try {
      await onSubmit(jersey);
      onClose();
    } catch {
      setPosting(false);
      setError(
        "Der Quarterback konnte nicht gespeichert werden. Bitte erneut versuchen.",
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
          {posting ? "Speichern …" : "QB speichern"}
        </button>
      }
      onClose={onClose}
      title={`QB · ${teamName}`}
    >
      <p className="sheetnote">
        Der Standard-Quarterback von {teamName}. Jeder Pass dieser Mannschaft
        startet mit ihm; ein einzelner Spielzug kann ihn im Assistenten
        weiterhin für sich ändern.
      </p>
      <h3 className="sheetsection">Quarterback</h3>
      {roster === null || players.length === 0 ? (
        <p className="sheetnote">
          Kein Kader geladen – der Quarterback kann nicht gewählt werden.
        </p>
      ) : (
        <JerseyPicker
          disabled={posting}
          groupLabel="Trikotnummer QB"
          label="QB"
          onChange={setJersey}
          optionalLabel="Ohne QB"
          players={players}
          value={jersey}
        />
      )}
    </Sheet>
  );
}
