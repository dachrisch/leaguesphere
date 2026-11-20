import type { Game } from "../types";
import { tickIdentity } from "../context/LivetickerContext";
import { eventDetail, eventMeta } from "../eventTypes";
import { formatClock } from "../format";

interface EventListProps {
  game: Game;
  allExpanded?: boolean;
  onToggleAll?: () => void;
  highlighted?: ReadonlySet<string>;
}

/** Stable list keys: a new tick shifts every index, and index keys would make
 *  React replace the whole list -- which also makes screen readers re-announce
 *  every unchanged event on each snapshot. */
function tickKeys(ticks: Game["ticks"]): string[] {
  const seen = new Map<string, number>();
  return ticks.map((tick) => {
    const identity = tickIdentity(tick);
    const occurrence = seen.get(identity) ?? 0;
    seen.set(identity, occurrence + 1);
    return `${identity}#${occurrence}`;
  });
}

export function EventList({
  game,
  allExpanded = false,
  onToggleAll = () => undefined,
  highlighted,
}: EventListProps) {
  const eventsId = `events-${game.gameId}`;
  const keys = tickKeys(game.ticks);
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
        <ol
          id={eventsId}
          className="lt-events"
          aria-label="Ereignisse"
          aria-live="polite"
          aria-atomic="false"
        >
          {game.ticks.map((tick, index) => {
            const team = teamFor(tick.team);
            const meta = eventMeta(tick.type);
            const detail = meta.label ? eventDetail(tick.text) : "";
            const isNew = highlighted?.has(
              `${game.gameId}:${tickIdentity(tick)}`,
            );
            return (
              <li
                key={keys[index]}
                className={isNew ? "lt-event lt-event-new" : "lt-event"}
              >
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
      {(allExpanded || game.tick_count > game.ticks.length) && (
        <button
          type="button"
          className="lt-all-events"
          aria-expanded={allExpanded}
          aria-controls={eventsId}
          onClick={onToggleAll}
        >
          <span>
            {allExpanded
              ? "Weniger anzeigen"
              : `Alle ${game.tick_count} Ereignisse`}
          </span>
          <span className="lt-chevron" aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
