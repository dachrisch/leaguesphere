type Props = {
  url: string;
  playerName: string;
  onClose: () => void;
};

function PhotoViewer({ url, playerName, onClose }: Props) {
  return (
    <div
      className="photo-viewer"
      role="dialog"
      aria-label={`Passfoto von ${playerName}`}
    >
      <img
        src={url}
        alt={`Passfoto von ${playerName}`}
        referrerPolicy="no-referrer"
      />
      <p className="photo-caption">Cache-Control: no-store</p>
      <button type="button" className="sheet-secondary" onClick={onClose}>
        Schließen
      </button>
    </div>
  );
}

export default PhotoViewer;
