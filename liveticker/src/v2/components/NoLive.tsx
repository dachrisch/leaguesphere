import type { Game } from "../types";
import { formatBerlinClock } from "../format";
import { isDelayed, minutesUntil } from "../selectors";

interface NoLiveProps {
  next: Game | null;
  now: Date;
}

/** The lead of the "Als Nächstes" section while no game is running. */
export function NoLive({ next, now }: NoLiveProps) {
  const delayed = next !== null && isDelayed(next, now);
  const remaining = next !== null && !delayed ? minutesUntil(next, now) : null;

  return (
    <section className="lt-no-live" aria-label="Kein Spiel live">
      <div className="lt-no-live-head">
        <div>
          <p className="lt-kicker">Kein Spiel läuft</p>
          <h2>Nächstes Spiel</h2>
          {next && (
            <p className="lt-context-meta">
              {formatBerlinClock(next.scheduled_at)} · Feld {next.field} ·{" "}
              {next.home.name} – {next.away.name}
            </p>
          )}
        </div>
        {delayed ? (
          <p className="lt-delayed-badge">verspätet</p>
        ) : (
          remaining !== null && (
            <p className="lt-countdown">in {remaining} Min</p>
          )
        )}
      </div>
      <p className="lt-status">Der Ticker startet mit dem Anpfiff.</p>
    </section>
  );
}
