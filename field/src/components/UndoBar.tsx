type Props = {
  playerName: string;
  onUndo: () => void;
  onDismiss: () => void;
};

function UndoBar({ playerName, onUndo, onDismiss }: Props) {
  return (
    <div className="undo-bar" role="status">
      <span className="undo-text">{playerName} geprüft</span>
      <button type="button" className="undo-button" onClick={onUndo}>
        Rückgängig
      </button>
      <button
        type="button"
        className="undo-close"
        aria-label="Hinweis schließen"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}

export default UndoBar;
