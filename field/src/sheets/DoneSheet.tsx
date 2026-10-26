type Props = {
  teamName: string;
  checkedCount: number;
  onBackToGames: () => void;
};

function DoneSheet({ teamName, checkedCount, onBackToGames }: Props) {
  return (
    <div className="sheet-backdrop">
      <section
        className="sheet"
        role="dialog"
        aria-label="Passliste gespeichert"
      >
        <header className="sheet-head">
          <div>
            <p className="field-kicker">Passcheck</p>
            <h2>Passliste gespeichert</h2>
          </div>
        </header>

        <p className="sheet-meta">
          {checkedCount} Spieler für {teamName} geprüft.
        </p>

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
