import type { Game } from "../types";
import { eventDetail, eventMeta } from "../eventTypes";
import { formatClock } from "../format";

interface EventListProps {
  game: Game;
}

export function EventList({ game }: EventListProps) {
  const teamFor = (side: "home" | "away" | null): string | null => {
    if (side === "home") return game.home.name;
    if (side === "away") return game.away.name;
    return null;
  };

  return (
    <section className="lt-events-card" aria-label="Spielverlauf">
      <h2>Spielverlauf</h2>
      {game.ticks.length === 0 ? (
        <p className="lt-empty">Noch keine Ereignisse.</p>
      ) : (
        <ol className="lt-events" aria-label="Ereignisse" aria-live="polite">
          {game.ticks.map((tick, index) => {
            const team = teamFor(tick.team);
            const meta = eventMeta(tick.type);
            const detail = meta.label ? eventDetail(tick.text) : "";
            return (
              <li key={`${tick.time}-${index}`} className="lt-event">
                <span className="lt-code" aria-hidden="true">
                  {meta.code}
                </span>
                <div className="lt-event-body">
                  <p className="lt-event-text">{meta.label ?? tick.text}</p>
                  {detail && <p className="lt-event-detail">{detail}</p>}
                  {team && <p className="lt-event-team">{team}</p>}
                </div>
                <time className="lt-event-time">{formatClock(tick.time)}</time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
