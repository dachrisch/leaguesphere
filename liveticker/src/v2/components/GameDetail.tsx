import type { Game } from "../types";
import { ContextHeader } from "./ContextHeader";
import { EventList } from "./EventList";
import { Scoreboard } from "./Scoreboard";

interface GameDetailProps {
  game: Game;
  allExpanded: boolean;
  onToggleAll: () => void;
}

/** The expanded game: scoreboard, context and event history. */
export function GameDetail({
  game,
  allExpanded,
  onToggleAll,
}: GameDetailProps) {
  const headingId = `game-heading-${game.gameId}`;
  const home = game.home.name || game.home.full_name;
  const away = game.away.name || game.away.full_name;

  return (
    <section
      id={`game-${game.gameId}`}
      className="lt-game-detail"
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="lt-game-title" tabIndex={-1}>
        {home} – {away}
      </h2>
      <ContextHeader game={game} showGameday={false} />
      <Scoreboard game={game} />
      <EventList
        game={game}
        allExpanded={allExpanded}
        onToggleAll={onToggleAll}
      />
    </section>
  );
}
