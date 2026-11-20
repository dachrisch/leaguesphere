import type { Game } from "../types";
import { shortTeamName, statusLabel } from "../format";

interface LiveStripProps {
  games: Game[];
  selectedId: number;
  onSelect: (gameId: number) => void;
}

export function LiveStrip({ games, selectedId, onSelect }: LiveStripProps) {
  return (
    <div className="lt-live-strip" role="group" aria-label="Live-Spiele">
      {games.map((game) => {
        const active = game.gameId === selectedId;
        return (
          <button
            key={game.gameId}
            type="button"
            className={
              active ? "lt-live-tab lt-live-tab-active" : "lt-live-tab"
            }
            aria-pressed={active}
            onClick={() => onSelect(game.gameId)}
          >
            <span className="lt-live-field">F{game.field}</span>
            <span className="lt-live-team">
              {shortTeamName(game.home.name || game.home.full_name)}
            </span>
            <b className="lt-live-score">
              {game.home.score ?? 0}:{game.away.score ?? 0}
            </b>
            <span className="lt-live-team">
              {shortTeamName(game.away.name || game.away.full_name)}
            </span>
            <span className="lt-sr">{statusLabel(game.status)}</span>
          </button>
        );
      })}
    </div>
  );
}
