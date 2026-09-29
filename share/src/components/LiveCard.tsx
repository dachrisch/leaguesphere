import type { LiveGame } from '../lib/types';

export function LiveCard({
  game,
  liveUrl = null,
}: {
  game: LiveGame;
  liveUrl?: string | null;
}) {
  const badge = <span className="badge text-bg-danger">LIVE</span>;
  return (
    <div className="content-section">
      <div className="d-flex justify-content-between align-items-center mb-2">
        {liveUrl !== null ? (
          <a
            className="share-live__link"
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {badge}
          </a>
        ) : (
          badge
        )}
        <span className="text-muted small">{game.status}</span>
      </div>
      <div className="d-flex justify-content-between align-items-center">
        <span className="fw-semibold">{game.home.name}</span>
        <span className="share-live__numbers fs-5">
          {game.home.score} : {game.away.score}
        </span>
        <span className="fw-semibold text-end">{game.away.name}</span>
      </div>
      {game.ticks.length > 0 && (
        <ul className="list-unstyled small mt-3 mb-0 border-top pt-2">
          {game.ticks.map((tick, index) => (
            <li
              key={`${tick.time}-${index}`}
              className={`d-flex gap-2 ${
                tick.team === null ? 'share-live__tick--neutral' : ''
              }`}
            >
              <span className="text-muted">{tick.time}</span>
              <span>{tick.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
