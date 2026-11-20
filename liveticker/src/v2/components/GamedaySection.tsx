import type { Game, GamedayGroup, Team } from "../types";
import {
  formatBerlinClock,
  formatBerlinDate,
  halftimeLabel,
  statusLabel,
} from "../format";
import {
  isDelayed,
  selectFinishedGames,
  selectLiveGames,
  selectUpcomingGames,
} from "../selectors";
import { GameDetail } from "./GameDetail";
import { LiveStrip } from "./LiveStrip";
import { NoLive } from "./NoLive";
import { TopBar } from "./TopBar";

interface GamedaySectionProps {
  group: GamedayGroup;
  now: Date;
  selectedId: number | null;
  all: boolean;
  onSelect: (gameId: number | null) => void;
  onToggleAll: (gameId: number) => void;
  highlighted?: ReadonlySet<string>;
}

const teamName = (team: Team): string => team.name || team.full_name;

function GamedayCard({
  group,
  liveCount,
}: {
  group: GamedayGroup;
  liveCount: number;
}) {
  const date = group.games[0]?.scheduled_at
    ? formatBerlinDate(group.games[0].scheduled_at)
    : "";
  return (
    <section className="lt-gameday-card" aria-label="Spieltag">
      <p className="lt-kicker">{group.league || "Liveticker"}</p>
      <p className="lt-gameday-card-title">{group.gameday.name || "Liveticker"}</p>
      <dl>
        {date && (
          <>
            <dt>Datum</dt>
            <dd>{date}</dd>
          </>
        )}
        {group.gameday.address && (
          <>
            <dt>Ort</dt>
            <dd>{group.gameday.address}</dd>
          </>
        )}
        <dt>Spiele</dt>
        <dd>{group.games.length}</dd>
        <dt>Live</dt>
        <dd>{liveCount}</dd>
      </dl>
    </section>
  );
}

function NextSection({
  games,
  now,
}: {
  games: Game[];
  now: Date;
}) {
  if (games.length === 0) return null;
  return (
    <section className="lt-section" aria-label="Als Nächstes">
      <h3 className="lt-section-title">Als Nächstes</h3>
      <ul className="lt-upcoming" aria-label="Kommende Spiele">
        {games.map((game) => {
          const delayed = isDelayed(game, now);
          return (
            <li
              key={game.gameId}
              className={
                delayed ? "lt-upcoming-row lt-upcoming-delayed" : "lt-upcoming-row"
              }
            >
              <span className="lt-upcoming-time">
                {formatBerlinClock(game.scheduled_at)}
              </span>
              <span className="lt-upcoming-teams">
                {teamName(game.home)} – {teamName(game.away)}
              </span>
              <span className="lt-upcoming-field">Feld {game.field}</span>
              {delayed && <span className="lt-delayed-badge">verspätet</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ResultsSection({
  games,
  selectedId,
  onSelect,
}: {
  games: Game[];
  selectedId: number | null;
  onSelect: (gameId: number | null) => void;
}) {
  if (games.length === 0) return null;
  return (
    <section className="lt-section" aria-label="Ergebnisse">
      <h3 className="lt-section-title">Ergebnisse</h3>
      <ul className="lt-results" aria-label="Beendete Spiele">
        {games.map((game) => {
          const expanded = game.gameId === selectedId;
          const homeScore = game.home.score ?? 0;
          const awayScore = game.away.score ?? 0;
          const halves = halftimeLabel(game.home, game.away);
          return (
            <li key={game.gameId} className="lt-result">
              <button
                type="button"
                className="lt-result-row"
                aria-expanded={expanded}
                aria-controls={expanded ? `game-${game.gameId}` : undefined}
                onClick={() => onSelect(expanded ? null : game.gameId)}
              >
                <span className="lt-result-status">{statusLabel(game.status)}</span>
                <span
                  className={
                    homeScore > awayScore
                      ? "lt-result-team lt-result-home lt-winner"
                      : "lt-result-team lt-result-home"
                  }
                >
                  {teamName(game.home)}
                </span>
                <span className="lt-result-score">
                  {homeScore} : {awayScore}
                </span>
                <span
                  className={
                    awayScore > homeScore
                      ? "lt-result-team lt-result-away lt-winner"
                      : "lt-result-team lt-result-away"
                  }
                >
                  {teamName(game.away)}
                </span>
                {halves && <span className="lt-result-halves">{halves}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** One gameday: compact header, selected game, then next and results. */
export function GamedaySection({
  group,
  now,
  selectedId,
  all,
  onSelect,
  onToggleAll,
  highlighted,
}: GamedaySectionProps) {
  const liveGames = selectLiveGames(group.games);
  const upcoming = selectUpcomingGames(group.games);
  const finished = selectFinishedGames(group.games);
  const liveSelected =
    liveGames.find((game) => game.gameId === selectedId) ?? liveGames[0];
  const selectedFinished =
    finished.find((game) => game.gameId === selectedId) ?? null;
  const selectedGame =
    group.games.find((game) => game.gameId === selectedId) ?? null;
  const lead = liveGames.length === 0 ? upcoming[0] ?? null : null;
  const upcomingRows = lead ? upcoming.slice(1) : upcoming;
  const detailGame = selectedFinished ?? (liveGames.length > 0 ? liveSelected : null);
  const shareGame =
    selectedGame ?? detailGame ?? upcoming[0] ?? finished[0] ?? null;
  const headingId = `gameday-${group.gameday.id}`;

  return (
    <section className="lt-gameday" aria-labelledby={headingId}>
      <TopBar
        league={group.league}
        gamedayName={group.gameday.name}
        liveCount={liveGames.length}
        shareGame={shareGame}
      />
      <div className="lt-layout">
        <div className="lt-primary">
          {liveGames.length > 0 && (
            <LiveStrip
              games={liveGames}
              selectedId={liveSelected.gameId}
              onSelect={onSelect}
            />
          )}
          {detailGame ? (
            <GameDetail
              game={detailGame}
              allExpanded={all && selectedId === detailGame.gameId}
              onToggleAll={() => onToggleAll(detailGame.gameId)}
              highlighted={highlighted}
            />
          ) : (
            <NoLive next={lead} now={now} />
          )}
        </div>
        <aside className="lt-rail">
          <GamedayCard group={group} liveCount={liveGames.length} />
          <NextSection games={upcomingRows} now={now} />
          <ResultsSection
            games={finished}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </aside>
      </div>
    </section>
  );
}
