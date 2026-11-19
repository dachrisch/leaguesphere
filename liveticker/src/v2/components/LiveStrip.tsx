import type { Game } from "../types";

interface LiveStripProps {
  games: Game[];
  selectedId: number;
  onSelect: (gameId: number) => void;
}

export function LiveStrip({ games, selectedId, onSelect }: LiveStripProps) {
  return (
    <div className="lt-live-strip" role="group" aria-label="Live-Spiele">
      {games.map((game) => (
        <button
          key={game.gameId}
          type="button"
          className={
            game.gameId === selectedId
              ? "lt-live-tab lt-live-tab-active"
              : "lt-live-tab"
          }
          aria-pressed={game.gameId === selectedId}
          onClick={() => onSelect(game.gameId)}
        >
          <span className="lt-live-field">Feld {game.field}</span>
          <span className="lt-live-team">
            <span>{game.home.name}</span>
            <b>{game.home.score ?? 0}</b>
          </span>
          <span className="lt-live-team">
            <span>{game.away.name}</span>
            <b>{game.away.score ?? 0}</b>
          </span>
          <span className="lt-live-status">{game.status}</span>
        </button>
      ))}
    </div>
  );
}
