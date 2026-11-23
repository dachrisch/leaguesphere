import type { Game } from "../types";
import { formatBerlinClock } from "../format";
import { isDelayed, minutesUntil } from "../selectors";

interface NoLiveProps {
  next: Game | null;
  now: Date;
}

/** Same window as the list and nav badges: beyond it a clock time reads better. */
const SOON_WITHIN_MINUTES = 90;

/** The lead of the "Als Nächstes" section while no game is running. */
export function NoLive({ next, now }: NoLiveProps) {
  const delayed = next !== null && isDelayed(next, now);
  const remaining = next !== null && !delayed ? minutesUntil(next, now) : null;
  const countdown =
    next !== null && remaining !== null
      ? remaining > SOON_WITHIN_MINUTES
        ? formatBerlinClock(next.scheduled_at)
        : `in ${remaining} Min`
      : null;

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
          countdown !== null && <p className="lt-countdown">{countdown}</p>
        )}
      </div>
      <p className="lt-status">Der Ticker startet mit dem Anpfiff.</p>
    </section>
  );
}
