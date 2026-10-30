import { useState } from "react";

import type { RosterEntry } from "../api/types";
import PhotoViewer from "../components/PhotoViewer";
import { CloseIcon } from "../components/icons";
import ThemeToggle from "../components/ThemeToggle";

type Props = {
  player: RosterEntry;
  teamName: string;
  checkedNumbers: number[];
  initialJersey?: number;
  warnings?: string[];
  photoUrl?: string;
  onConfirm: (jersey: number) => void;
  onClose: () => void;
};

const MIN_JERSEY = 0;
const MAX_JERSEY = 99;

function PlayerSheet({
  player,
  teamName,
  checkedNumbers,
  initialJersey,
  warnings = [],
  photoUrl,
  onConfirm,
  onClose,
}: Props) {
  const name = `${player.first_name} ${player.last_name}`;
  const blocked = Boolean(player.validationError);
  const [jersey, setJersey] = useState(initialJersey ?? player.jersey_number);
  const [showPhoto, setShowPhoto] = useState(false);

  const step = (direction: 1 | -1) => {
    let candidate = jersey;
    for (let index = 0; index < MAX_JERSEY - MIN_JERSEY + 1; index += 1) {
      candidate += direction;
      if (candidate < MIN_JERSEY || candidate > MAX_JERSEY) {
        return;
      }
      if (!checkedNumbers.includes(candidate)) {
        setJersey(candidate);
        return;
      }
    }
  };

  return (
    <div className="sheet-backdrop">
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${name} prüfen`}
      >
        <header className="sheet-head">
          <div>
            <p className="passcheck-kicker">{teamName}</p>
            <h2>{name}</h2>
          </div>
          <div className="sheet-head-actions">
            <ThemeToggle compact />
            <button
              type="button"
              className="icon-btn"
              aria-label="Schließen"
              onClick={onClose}
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </header>

        <p className="sheet-meta">Passnummer {player.pass_number}</p>

        {player.validationError && (
          <p className="rule-blocked" role="alert">
            {player.validationError}
          </p>
        )}

        {warnings.map((warning) => (
          <p className="rule-warning" key={warning}>
            {warning}
          </p>
        ))}

        <div className="sheet-photo-block">
          {photoUrl && (
            <button
              type="button"
              className="sheet-secondary"
              onClick={() => setShowPhoto(true)}
            >
              Foto ansehen
            </button>
          )}
        </div>

        {showPhoto && photoUrl && (
          <PhotoViewer
            url={photoUrl}
            playerName={name}
            onClose={() => setShowPhoto(false)}
          />
        )}

        <div className="jersey-stepper">
          <button
            type="button"
            className="icon-btn"
            aria-label="Vorherige Nummer"
            onClick={() => step(-1)}
          >
            −
          </button>
          <input
            type="number"
            aria-label="Trikotnummer"
            readOnly
            value={jersey}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label="Nächste Nummer"
            onClick={() => step(1)}
          >
            +
          </button>
        </div>

        <footer className="sheet-foot">
          <button type="button" className="sheet-secondary" onClick={onClose}>
            Abbrechen
          </button>
          {!blocked && (
            <button
              type="button"
              className="sheet-primary"
              onClick={() => onConfirm(jersey)}
            >
              Bestätigen
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

export default PlayerSheet;
