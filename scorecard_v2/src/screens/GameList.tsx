import type { Game } from "../api/types";
import Screen from "../components/Screen";
import SnapshotHint from "../components/SnapshotHint";
import { gameTag, type GameTag } from "../components/tag";

interface GameListProps {
  games: Game[];
  onSelect: (game: Game) => void;
  onResume: (game: Game) => void;
  /** Gameday name; Task 21 passes it, the default keeps the screen usable alone. */
  title?: string;
  /** Gameday date and venue, shown under the title. */
  subtitle?: string;
  /** True while the whole gameday is shown, not only the user's crew. */
  allGames?: boolean;
  /** Switches between "my games" and the whole gameday (`?team=*`). */
  onToggleAll?: () => void;
  /** Age of a stored games list; `null` when it came from the server. */
  staleSince?: number | null;
  /** Header chrome owned by the flow. */
  onBack?: () => void;
  onLogout?: () => void;
}

const CLOCK = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

/**
 * Render the API's `scheduled` value as `HH:MM`.
 *
 * pandas serialises the raw `TimeField`, so the payload is `"13:30:00"`; the
 * seconds are dropped. An empty or malformed value becomes `–` instead of
 * throwing or blowing up the row layout.
 */
export function formatGameTime(scheduled: string | null | undefined): string {
  const match = CLOCK.exec(scheduled ?? "");
  if (match === null) {
    return "–";
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return "–";
  }
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

function isScore(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** `7:21`, or `–` while either side of the result is missing. */
export function formatGameScore(
  home: number | null | undefined,
  away: number | null | undefined,
): string {
  if (!isScore(home) || !isScore(away)) {
    return "–";
  }
  return `${home}:${away}`;
}

/** Bracket placeholders arrive as `null`; an empty name is just as useless. */
function teamLabel(name: string | null): string {
  return name !== null && name.trim() !== "" ? name : "–";
}

/**
 * Counts per summary bucket. Keyed by the row action rather than the tag
 * variant, so a future variant cannot silently land in "offen".
 */
function summarise(games: Game[]) {
  const counts = { done: 0, live: 0, open: 0 };
  for (const game of games) {
    const tag = gameTag(game.status);
    if (tag.action === "none") {
      counts.done += 1;
    } else if (tag.action === "resume") {
      counts.live += 1;
    } else {
      counts.open += 1;
    }
  }
  return counts;
}

function rowName(game: Game, tag: GameTag): string {
  const parts = [
    formatGameTime(game.scheduled),
    `Feld ${game.field}`,
    `${teamLabel(game.home)} gegen ${teamLabel(game.away)}`,
    formatGameScore(game.points_home, game.points_away),
    tag.label,
  ];
  // The chip is visual only; without this the passcheck state is invisible to
  // screen readers.
  if (game.passcheck === true) {
    parts.push("Passcheck geprüft");
  } else if (game.passcheck === false) {
    parts.push("kein Passcheck");
  }
  return parts.join(", ");
}

function RowBody({ game, tag }: { game: Game; tag: GameTag }) {
  const officials = game.officials.trim();
  const passcheck = game.passcheck;
  const hasChip = passcheck === true || passcheck === false;

  return (
    <>
      <span>
        <span className="game-time">{formatGameTime(game.scheduled)}</span>
        <span className="game-field">Feld {game.field}</span>
      </span>
      <span className="game-main">
        <span className="game-pair">
          {teamLabel(game.home)} – {teamLabel(game.away)}
        </span>
        {officials !== "" || hasChip ? (
          <span className="game-sub">
            {officials}
            {officials !== "" && hasChip ? " · " : null}
            {passcheck === true ? (
              <span className="chip-ok">Passcheck</span>
            ) : null}
            {passcheck === false ? (
              <span className="chip-miss">kein Passcheck</span>
            ) : null}
          </span>
        ) : null}
      </span>
      <span className="game-right">
        <span className="game-score">
          {formatGameScore(game.points_home, game.points_away)}
        </span>
        <span className={`tag tag-${tag.variant}`}>{tag.label}</span>
      </span>
    </>
  );
}

export default function GameList({
  games,
  onSelect,
  onResume,
  title,
  subtitle,
  allGames = false,
  onToggleAll,
  staleSince = null,
  onBack,
  onLogout,
}: GameListProps) {
  const counts = summarise(games);

  return (
    <Screen
      kicker="Scorecard"
      onBack={onBack}
      onLogout={onLogout}
      sub={subtitle}
      title={title ?? "Spiele"}
    >
      <SnapshotHint updatedAt={staleSince} />
      {onToggleAll === undefined ? null : (
        <div className="scopebar">
          <button
            aria-pressed={allGames}
            className={allGames ? "scopebtn sel" : "scopebtn"}
            onClick={onToggleAll}
            type="button"
          >
            {allGames ? "Alle Spiele" : "Meine Spiele"}
          </button>
          <span className="scopehint">
            {allGames ? "Ganzer Spieltag" : "Nur deine Einteilung"}
          </span>
        </div>
      )}
      {games.length === 0 ? (
        <div className="empty-state" role="status">
          <h2 className="empty-title">Keine Spiele für diesen Spieltag</h2>
          <p className="empty-text">
            Sobald der Spielplan veröffentlicht ist, erscheinen hier die
            Spiele.
          </p>
        </div>
      ) : (
        <>
          <div className="sumline">
            <div>
              <b>{counts.done}</b> beendet
            </div>
            <div>
              <b>{counts.live}</b> läuft
            </div>
            <div>
              <b>{counts.open}</b> offen
            </div>
          </div>
          <ul className="game-list">
            {games.map((game) => {
              const tag = gameTag(game.status);
              const handleClick =
                tag.action === "none"
                  ? undefined
                  : () =>
                      tag.action === "resume"
                        ? onResume(game)
                        : onSelect(game);
              return (
                <li key={game.id}>
                  {handleClick === undefined ? (
                    <div className="game-row">
                      <RowBody game={game} tag={tag} />
                    </div>
                  ) : (
                    <button
                      aria-label={rowName(game, tag)}
                      className="game-row"
                      onClick={handleClick}
                      type="button"
                    >
                      <RowBody game={game} tag={tag} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="vnote">
            Laufende Spiele öffnen die Erfassung, geplante die Vorbereitung.
            Beendete zeigen nur das Ergebnis.
          </p>
        </>
      )}
    </Screen>
  );
}
