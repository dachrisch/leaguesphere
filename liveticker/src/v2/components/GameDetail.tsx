import type { Game } from "../types";
import { EventList } from "./EventList";
import { Scoreboard } from "./Scoreboard";

interface GameDetailProps {
  game: Game;
  allExpanded: boolean;
  onToggleAll: () => void;
}

/** The expanded game: scoreboard and event history. */
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
      <h2 id={headingId} className="lt-sr" tabIndex={-1}>
        {home} – {away}
      </h2>
      <Scoreboard game={game} />
      <EventList
        game={game}
        allExpanded={allExpanded}
        onToggleAll={onToggleAll}
      />
    </section>
  );
}
