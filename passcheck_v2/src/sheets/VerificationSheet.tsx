import { useState, type FormEvent } from "react";

type Props = {
  teamName: string;
  checkedCount: number;
  minimumStrength: number;
  initialOfficialName?: string;
  initialNote?: string;
  errors?: Record<string, string>;
  conflict?: string | null;
  saving?: boolean;
  pendingCount?: number;
  onSave: (officialName: string, note: string) => void | Promise<void>;
  onClose: () => void;
};

function VerificationSheet({
  teamName,
  checkedCount,
  minimumStrength,
  initialOfficialName = "",
  initialNote = "",
  errors,
  conflict,
  saving = false,
  pendingCount = 0,
  onSave,
  onClose,
}: Props) {
  const [officialName, setOfficialName] = useState(initialOfficialName);
  const [note, setNote] = useState(initialNote);

  const minimumReached = checkedCount >= minimumStrength;
  const canSave =
    minimumReached &&
    officialName.trim().length > 0 &&
    !saving &&
    pendingCount === 0;
  const playerErrors = Object.entries(errors ?? {}).filter(
    ([key]) => key !== "team"
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    void onSave(officialName.trim(), note);
  };

  return (
    <div className="sheet-backdrop">
      <form
        className="sheet"
        role="dialog"
        aria-label="Passliste abschließen"
        onSubmit={handleSubmit}
      >
        <header className="sheet-head">
          <div>
            <p className="passcheck-kicker">Passcheck v2</p>
            <h2>Passliste abschließen</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Schließen"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <p className="sheet-meta">
          {teamName}: {checkedCount} Spieler geprüft
        </p>

        {!minimumReached && (
          <p className="rule-blocked" role="alert">
            Mindestspielstärke {minimumStrength} nicht erreicht ({checkedCount}{" "}
            geprüft).
          </p>
        )}

        {errors?.team && (
          <p className="rule-blocked" role="alert">
            {errors.team}
          </p>
        )}

        {playerErrors.map(([playerId, message]) => (
          <p className="rule-blocked" key={playerId}>
            {message}
          </p>
        ))}

        {pendingCount > 0 && (
          <p className="rule-warning" role="status">
            {pendingCount} Einträge warten auf Übertragung.
          </p>
        )}

        {conflict && (
          <p className="rule-blocked" role="alert">
            {conflict}
          </p>
        )}

        <label className="passcheck-label" htmlFor="official-name">
          Abgenommen durch
        </label>
        <input
          id="official-name"
          className="passcheck-input"
          value={officialName}
          onChange={(event) => setOfficialName(event.target.value)}
          autoComplete="name"
          autoFocus
          required
        />

        <label className="passcheck-label" htmlFor="verification-note">
          Anmerkungen
        </label>
        <textarea
          id="verification-note"
          className="passcheck-input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
        />

        <footer className="sheet-foot">
          <button type="button" className="sheet-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="sheet-primary" disabled={!canSave}>
            Passliste speichern
          </button>
        </footer>
      </form>
    </div>
  );
}

export default VerificationSheet;
