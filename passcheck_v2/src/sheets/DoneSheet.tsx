import ThemeToggle from "../components/ThemeToggle";

type Props = {
  teamName: string;
  checkedCount: number;
  pendingCount?: number;
  onBackToGames: () => void;
};

function DoneSheet({
  teamName,
  checkedCount,
  pendingCount = 0,
  onBackToGames,
}: Props) {
  return (
    <div className="sheet-backdrop">
      <section
        className="sheet"
        role="dialog"
        aria-label="Passliste gespeichert"
      >
        <header className="sheet-head">
          <div>
            <p className="passcheck-kicker">Passcheck v2</p>
            <h2>Passliste gespeichert</h2>
          </div>
          <ThemeToggle compact />
        </header>

        <p className="sheet-meta">
          {checkedCount} Spieler für {teamName} geprüft.
        </p>

        {pendingCount > 0 && (
          <p className="rule-warning" role="status">
            {pendingCount} Einträge warten auf Übertragung.
          </p>
        )}

        <footer className="sheet-foot">
          <button
            type="button"
            className="sheet-primary"
            onClick={onBackToGames}
          >
            Zurück zu den Spielen
          </button>
        </footer>
      </section>
    </div>
  );
}

export default DoneSheet;
