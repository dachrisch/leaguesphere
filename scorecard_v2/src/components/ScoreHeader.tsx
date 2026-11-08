import type { GameLogTeam } from "../api/types";
import TeamLogo from "./TeamLogo";
import { Football } from "./icons";

/** What is left of a side's timeouts this half. */
export interface HeaderTimeouts {
  used: number;
  perHalf: number;
}

interface ScoreHeaderProps {
  home: GameLogTeam;
  away: GameLogTeam;
  /** Team name currently in possession, from the log payload. */
  possession: string | null;
  isFirstHalf: boolean;
  /** True while a possession change is in flight. */
  disabled: boolean;
  /**
   * Tapping a team hands it the ball. Omitted where the screen has its own
   * possession control: the board then only shows the teams and the score.
   */
  onPossession?: (teamName: string) => void;
  /** Timeouts left of a side this half, for the circles in its row. */
  timeouts?: (team: GameLogTeam) => HeaderTimeouts | null;
  /** Tapping the circles takes a timeout (L6's dialog). */
  onTimeout?: (teamName: string) => void;
  /** A write is in flight; the circles are inert. */
  timeoutDisabled?: boolean;
}

type Side = "home" | "away";

function displayName(team: GameLogTeam): string {
  const name = team.name?.trim();
  return name === undefined || name === "" ? "–" : name;
}

/**
 * Possession is stored as the team *name* (the projection writes it from a
 * `possession` event; the old app writes it through `PUT /possession`), but a
 * seeded game may hold the pk — accept both.
 */
export function isPossessing(
  team: GameLogTeam,
  possession: string | null,
): boolean {
  const token = possession?.trim();
  if (token === undefined || token === "") {
    return false;
  }
  const name = team.name?.trim();
  if (name !== undefined && name.toLowerCase() === token.toLowerCase()) {
    return true;
  }
  return team.id !== null && String(team.id) === token;
}

/** `●●` → `●○` → `○○`: filled circles are the timeouts still available. */
export function timeoutDots({ used, perHalf }: HeaderTimeouts): string {
  const remaining = Math.max(0, Math.min(perHalf, perHalf - used));
  return Array.from({ length: perHalf }, (_, index) =>
    index < remaining ? "●" : "○",
  ).join("");
}

interface TeamProps {
  side: Side;
  team: GameLogTeam;
  possessing: boolean;
  disabled: boolean;
  onPossession?: (teamName: string) => void;
  timeouts?: HeaderTimeouts | null;
  onTimeout?: (teamName: string) => void;
  timeoutDisabled?: boolean;
}

function Team({
  side,
  team,
  possessing,
  disabled,
  onPossession,
  timeouts,
  onTimeout,
  timeoutDisabled = false,
}: TeamProps) {
  const name = displayName(team);
  const points = team.score === 1 ? "Punkt" : "Punkte";
  const label = `${name}, ${team.score} ${points}, ${
    possessing ? "am Ball" : "nicht am Ball"
  }`;

  const content = (
    <>
      <TeamLogo className="teamlogo-crest" name={team.name} />
      <span className="teamtext">
        <span className="tname">{name}</span>
        {possessing ? (
          <span className="poss">
            <Football size={12} />
            Ball
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <div className={possessing ? `team ${side} hasball` : `team ${side}`}>
      {onPossession === undefined ? (
        <div className="teampick">{content}</div>
      ) : (
        <button
          aria-label={label}
          aria-pressed={possessing}
          className="teampick"
          disabled={disabled || team.name === null}
          onClick={() => {
            if (team.name !== null) {
              onPossession(team.name);
            }
          }}
          type="button"
        >
          {content}
          <kbd aria-hidden="true" className="shortcut-hint" data-key="B" />
        </button>
      )}
      {onTimeout === undefined ||
      timeouts === undefined ||
      timeouts === null ||
      team.name === null ? null : (
        <button
          aria-label={`Auszeit ${name}`}
          className={
            timeouts.used >= timeouts.perHalf
              ? "timeoutdots is-used"
              : "timeoutdots"
          }
          disabled={timeoutDisabled || !team.name}
          onClick={() => {
            if (team.name !== null) {
              onTimeout(team.name);
            }
          }}
          title={`${Math.max(0, timeouts.perHalf - timeouts.used)} von ${
            timeouts.perHalf
          } Auszeiten übrig`}
          type="button"
        >
          <span aria-hidden="true">{timeoutDots(timeouts)}</span>
        </button>
      )}
    </div>
  );
}

/**
 * Score board: both teams with their logo (or a crest placeholder), the big
 * score, the possession marker and the half label. Tapping a team hands it the
 * ball; the circles beside it are its timeouts.
 */
export default function ScoreHeader({
  home,
  away,
  possession,
  isFirstHalf,
  disabled,
  onPossession,
  timeouts,
  onTimeout,
  timeoutDisabled = false,
}: ScoreHeaderProps) {
  const sideTimeouts = (
    team: GameLogTeam,
  ): HeaderTimeouts | null => timeouts?.(team) ?? null;

  return (
    <section aria-label="Spielstand" className="board">
      <div className="scoreline">
        <Team
          disabled={disabled}
          onPossession={onPossession}
          onTimeout={onTimeout}
          possessing={isPossessing(home, possession)}
          side="home"
          team={home}
          timeoutDisabled={timeoutDisabled}
          timeouts={sideTimeouts(home)}
        />
        <div className="clock">
          <p className="score">
            <span>{home.score}</span>
            <span aria-hidden="true" className="sep">
              :
            </span>
            <span>{away.score}</span>
          </p>
          <p className="half">{isFirstHalf ? "1. Halbzeit" : "2. Halbzeit"}</p>
        </div>
        <Team
          disabled={disabled}
          onPossession={onPossession}
          onTimeout={onTimeout}
          possessing={isPossessing(away, possession)}
          side="away"
          team={away}
          timeoutDisabled={timeoutDisabled}
          timeouts={sideTimeouts(away)}
        />
      </div>
    </section>
  );
}
