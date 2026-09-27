import type { LiveGame } from '@/lib/types';

export function LiveCard({ game }: { game: LiveGame }) {
  return (
    <article className="share-live" data-testid={`live-${game.gameId}`}>
      <header className="share-live__header">
        <span className="share-live__status">{game.status}</span>
      </header>
      <div className="share-live__score">
        <span className="share-live__team">{game.home.name}</span>
        <span className="share-live__numbers">
          {game.home.score} : {game.away.score}
        </span>
        <span className="share-live__team share-live__team--away">
          {game.away.name}
        </span>
      </div>
      {game.ticks.length > 0 && (
        <ul className="share-live__ticks">
          {game.ticks.map((tick, index) => (
            <li
              key={`${tick.time}-${index}`}
              className={`share-live__tick share-live__tick--${tick.team ?? 'neutral'}`}
            >
              <span className="share-live__tick-time">{tick.time}</span>
              <span className="share-live__tick-text">{tick.text}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
