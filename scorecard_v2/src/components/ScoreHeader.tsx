import type { GameLogTeam } from "../api/types";

interface ScoreHeaderProps {
  home: GameLogTeam;
  away: GameLogTeam;
  /** Team name currently in possession, from the log payload. */
  possession: string | null;
  isFirstHalf: boolean;
  /** True while a possession change is in flight. */
  disabled: boolean;
  onPossession: (teamName: string) => void;
}

type Side = "home" | "away";

function displayName(team: GameLogTeam): string {
  const name = team.name?.trim();
  return name === undefined || name === "" ? "–" : name;
}

/** Crest placeholder: one initial, never a logo URL. */
export function crestInitial(team: GameLogTeam): string {
  const name = team.name?.trim();
  return name === undefined || name === "" ? "?" : name[0].toUpperCase();
}

/**
 * Possession is stored as the team *name* (the old app and `PUT /possession`
 * both write it), but a seeded game may hold the pk — accept both.
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
  onPossession: (teamName: string) => void;
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
      <span aria-hidden="true" className="crest">
        {crestInitial(team)}
      </span>
      <span className="tname">{name}</span>
      {possessing ? <span className="poss">am Ball</span> : null}
    </button>
  );
}

/**
 * Score board: both teams with a crest placeholder, the big score, the
 * possession marker and the half label. Tapping a team hands it the ball.
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
