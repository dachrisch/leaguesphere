import type { GameLogTeam } from "../api/types";
import TeamLogo from "./TeamLogo";
import { Football } from "./icons";

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
   * possession control (the tracking cockpit's switch): the board then only
   * shows the teams and the score.
   */
  onPossession?: (teamName: string) => void;
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

interface TeamProps {
  side: Side;
  team: GameLogTeam;
  possessing: boolean;
  disabled: boolean;
  onPossession?: (teamName: string) => void;
}

function Team({
  side,
  team,
  possessing,
  disabled,
  onPossession,
}: TeamProps) {
  const name = displayName(team);
  const points = team.score === 1 ? "Punkt" : "Punkte";
  const label = `${name}, ${team.score} ${points}, ${
    possessing ? "am Ball" : "nicht am Ball"
  }`;

  if (onPossession === undefined) {
    return (
      <div className={`team ${side}`}>
        <TeamLogo className="teamlogo-crest" name={team.name} />
        <span className="teamtext">
          <span className="tname">{name}</span>
        </span>
      </div>
    );
  }

  return (
    <button
      aria-label={label}
      aria-pressed={possessing}
      className={possessing ? `team ${side} hasball` : `team ${side}`}
      disabled={disabled || team.name === null}
      onClick={() => {
        if (team.name !== null) {
          onPossession(team.name);
        }
      }}
      type="button"
    >
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
    </button>
  );
}

/**
 * Score board: both teams with their logo (or a crest placeholder), the big
 * score, the possession marker and the half label. Tapping a team hands it the
 * ball.
 */
export default function ScoreHeader({
  home,
  away,
  possession,
  isFirstHalf,
  disabled,
  onPossession,
}: ScoreHeaderProps) {
  return (
    <section aria-label="Spielstand" className="board">
      <div className="scoreline">
        <Team
          disabled={disabled}
          onPossession={onPossession}
          possessing={isPossessing(home, possession)}
          side="home"
          team={home}
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
          possessing={isPossessing(away, possession)}
          side="away"
          team={away}
        />
      </div>
    </section>
  );
}
