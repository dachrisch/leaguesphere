import type { Game, GamedayGroup, Team } from "../types";
import { formatBerlinClock } from "../format";
import {
  isDelayed,
  selectFinishedGames,
  selectLiveGames,
  selectUpcomingGames,
} from "../selectors";
import { GameDetail } from "./GameDetail";
import { LiveStrip } from "./LiveStrip";
import { NoLive } from "./NoLive";

interface GamedaySectionProps {
  group: GamedayGroup;
  now: Date;
  selectedId: number | null;
  all: boolean;
  onSelect: (gameId: number | null) => void;
  onToggleAll: (gameId: number) => void;
}

const teamName = (team: Team): string => team.name || team.full_name;

function halftimeLine(game: Game): string {
  const parts: string[] = [];
  if (game.home.fh !== null || game.away.fh !== null) {
    parts.push(`${game.home.fh ?? "–"}:${game.away.fh ?? "–"}`);
  }
  if (game.home.sh !== null || game.away.sh !== null) {
    parts.push(`${game.home.sh ?? "–"}:${game.away.sh ?? "–"}`);
  }
  return parts.length > 0 ? `Halbzeit ${parts.join(" · ")}` : "";
}

/** One gameday: live, then upcoming, then the results, in that order. */
export function GamedaySection({
  group,
  now,
  selectedId,
  all,
  onSelect,
  onToggleAll,
}: GamedaySectionProps) {
  const liveGames = selectLiveGames(group.games);
  const upcoming = selectUpcomingGames(group.games);
  const finished = selectFinishedGames(group.games);
  const liveSelected = liveGames.find((game) => game.gameId === selectedId) ?? liveGames[0];
  const lead = liveGames.length === 0 ? upcoming[0] ?? null : null;
  const upcomingRows = lead ? upcoming.slice(1) : upcoming;
  const headingId = `gameday-${group.gameday.id}`;

  return (
    <section className="lt-gameday" aria-labelledby={headingId}>
      <header className="lt-gameday-head">
        <p className="lt-kicker">{group.league || "Liveticker"}</p>
        <h2 id={headingId}>{group.gameday.name || "Liveticker"}</h2>
        {group.gameday.address && (
          <p className="lt-context-meta">{group.gameday.address}</p>
        )}
      </header>

      {liveGames.length > 0 && (
        <section className="lt-section" aria-label="Live">
          <h3 className="lt-section-title">Live</h3>
          {liveGames.length > 1 && (
            <LiveStrip
              games={liveGames}
              selectedId={liveSelected.gameId}
              onSelect={onSelect}
            />
          )}
          <GameDetail
            game={liveSelected}
            allExpanded={all && selectedId === liveSelected.gameId}
            onToggleAll={() => onToggleAll(liveSelected.gameId)}
          />
        </section>
      )}

      {(upcoming.length > 0 || liveGames.length === 0) && (
        <section className="lt-section" aria-label="Als Nächstes">
          <h3 className="lt-section-title">Als Nächstes</h3>
          {lead && <NoLive next={lead} now={now} />}
          {!lead && upcomingRows.length === 0 && liveGames.length === 0 && (
            <NoLive next={null} now={now} />
          )}
          {upcomingRows.length > 0 && (
            <ul className="lt-upcoming" aria-label="Kommende Spiele">
              {upcomingRows.map((game) => {
                const delayed = isDelayed(game, now);
                return (
                  <li
                    key={game.gameId}
                    className={
                      delayed
                        ? "lt-upcoming-row lt-upcoming-delayed"
                        : "lt-upcoming-row"
                    }
                  >
                    <span className="lt-upcoming-time">
                      {formatBerlinClock(game.scheduled_at)}
                    </span>
                    <span className="lt-upcoming-teams">
                      {teamName(game.home)} – {teamName(game.away)}
                    </span>
                    <span className="lt-upcoming-field">Feld {game.field}</span>
                    {delayed && (
                      <span className="lt-delayed-badge">verspätet</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {finished.length > 0 && (
        <section className="lt-section" aria-label="Ergebnisse">
          <h3 className="lt-section-title">Ergebnisse</h3>
          <ul className="lt-results" aria-label="Beendete Spiele">
            {finished.map((game) => {
              const expanded = game.gameId === selectedId;
              const halves = halftimeLine(game);
              return (
                <li key={game.gameId} className="lt-result">
                  <button
                    type="button"
                    className="lt-result-row"
                    aria-expanded={expanded}
                    aria-controls={expanded ? `game-${game.gameId}` : undefined}
                    onClick={() => onSelect(expanded ? null : game.gameId)}
                  >
                    <span className="lt-result-team lt-result-home">
                      {teamName(game.home)}
                    </span>
                    <span className="lt-result-score">
                      {game.home.score ?? 0} : {game.away.score ?? 0}
                    </span>
                    <span className="lt-result-team lt-result-away">
                      {teamName(game.away)}
                    </span>
                    {halves && (
                      <span className="lt-result-halves">{halves}</span>
                    )}
                  </button>
                  {expanded && (
                    <GameDetail
                      game={game}
                      allExpanded={all}
                      onToggleAll={() => onToggleAll(game.gameId)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </section>
  );
}
