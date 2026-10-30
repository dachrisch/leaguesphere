import { CloseIcon, UndoIcon } from "./icons";

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
        <UndoIcon size={16} />
        Rückgängig
      </button>
      <button
        type="button"
        className="undo-close"
        aria-label="Hinweis schließen"
        onClick={onDismiss}
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}

export default UndoBar;
