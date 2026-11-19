import type { Game } from "../types";
import { formatBerlinClock } from "../format";
import { isDelayed, minutesUntil, selectNextGame } from "../selectors";

interface NoLiveProps {
  games: Game[];
  now: Date;
}

export function NoLive({ games, now }: NoLiveProps) {
  const next = selectNextGame(games, now);
  const delayed = games.filter(
    (game) => game.status === "Geplant" && isDelayed(game, now),
  );
  const remaining = next ? minutesUntil(next, now) : null;

  return (
    <section className="lt-no-live" aria-label="Kein Spiel live">
      <div className="lt-no-live-head">
        <div>
          <p className="lt-kicker">Kein Spiel läuft</p>
          <h1>Nächstes Spiel</h1>
          {next && (
            <p className="lt-context-meta">
              {formatBerlinClock(next.scheduled_at)} · Feld {next.field} · {next.home.name} –{" "}
              {next.away.name}
            </p>
          )}
        </div>
        {remaining !== null && (
          <p className="lt-countdown">in {remaining} Min</p>
        )}
      </div>
      {delayed.length > 0 && (
        <div className="lt-delayed">
          <h2>Verspätet</h2>
          {delayed.map((game) => (
            <p key={game.gameId} className="lt-delayed-row">
              <span>{formatBerlinClock(game.scheduled_at)}</span>
              <span>
                Feld {game.field} · {game.home.name} – {game.away.name}
              </span>
              <b>verspätet</b>
            </p>
          ))}
        </div>
      )}
      <p className="lt-status">Der Ticker startet mit dem Anpfiff.</p>
    </section>
  );
}
