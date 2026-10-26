import type { Game, GameStatus } from "../api/types";
import Screen from "../components/Screen";
import type { TagVariant } from "./GamedayList";

/**
 * A game as this screen reads it: the whistle row plus the passcheck flag.
 *
 * The API does not send `passcheck` until Task 6, so it is optional here —
 * absent means "unknown" and renders no chip, which is different from the
 * explicit `false` ("kein Passcheck").
 */
export type GameListGame = Game & { passcheck?: boolean };

interface GameListProps {
  games: GameListGame[];
  /** Guard: this screen renders games, never gamedays (Task 21 owns routing). */
  gamedays?: never;
  onSelect: (game: Game) => void;
  onResume: (game: Game) => void;
  /** Gameday name; Task 21 passes it, the default keeps the screen usable alone. */
  title?: string;
  /** Gameday date and venue, shown under the title. */
  subtitle?: string;
}

/** How a row reacts to a tap. A finished game is inert, not merely disabled. */
export type GameRowAction = "select" | "resume" | "none";

export interface GameTag {
  variant: TagVariant;
  label: string;
  action: GameRowAction;
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
 * German status vocabulary shared with the gameday screen: a planned game is
 * open, a started one is running, a finished one is done and no longer
 * actionable. `""` comes from designer-built rows and behaves like `Geplant`.
 */
export function gameTag(status: GameStatus): GameTag {
  if (status === "beendet") {
    return { variant: "done", label: "beendet", action: "none" };
  }
  if (
    status === "Gestartet" ||
    status === "1. Halbzeit" ||
    status === "2. Halbzeit"
  ) {
    return { variant: "live", label: "läuft", action: "resume" };
  }
  return { variant: "open", label: "offen", action: "select" };
}

function summarise(games: GameListGame[]) {
  const counts = { done: 0, live: 0, open: 0 };
  for (const game of games) {
    const tag = gameTag(game.status);
    if (tag.variant === "done") {
      counts.done += 1;
    } else if (tag.variant === "live") {
      counts.live += 1;
    } else {
      counts.open += 1;
    }
  }
  return counts;
}

function RowBody({ game, tag }: { game: GameListGame; tag: GameTag }) {
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
}: GameListProps) {
  const counts = summarise(games);

  return (
    <Screen kicker="Scorecard" sub={subtitle} title={title ?? "Spiele"}>
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
              return (
                <li key={game.id}>
                  {tag.action === "none" ? (
                    <div className="game-row">
                      <RowBody game={game} tag={tag} />
                    </div>
                  ) : (
                    <button
                      className="game-row"
                      onClick={() =>
                        tag.action === "resume"
                          ? onResume(game)
                          : onSelect(game)
                      }
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
