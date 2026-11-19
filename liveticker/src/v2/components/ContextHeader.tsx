import type { Game } from "../types";
import { formatBerlinClock, formatClock } from "../format";

interface ContextHeaderProps {
  game: Game;
  showGameday?: boolean;
}

export function ContextHeader({ game, showGameday = true }: ContextHeaderProps) {
  const parts = [
    game.gameday.address,
    game.field ? `Feld ${game.field}` : null,
    game.stage,
    game.standing,
  ].filter((part): part is string => Boolean(part));

  return (
    <header className="lt-context">
      {showGameday && (
        <>
          <p className="lt-kicker">{game.league || "Liveticker"}</p>
          <h1>{game.gameday.name || "Liveticker"}</h1>
        </>
      )}
      <p className="lt-context-meta">
        {parts.join(" · ")}
        <span className="lt-sep"> · </span>
        Anstoß {game.scheduled_at ? formatBerlinClock(game.scheduled_at) : formatClock(game.time)}
      </p>
    </header>
  );
}
