import type { Game, Team } from "../types";
import {
  formatBerlinClock,
  formatClock,
  halftimeLabel,
  statusLabel,
  teamBadges,
} from "../format";

interface TeamSideProps {
  team: Team;
  side: "home" | "away";
  finished: boolean;
  badge: string;
}

function TeamSide({ team, side, finished, badge }: TeamSideProps) {
  const name = team.name || team.full_name;
  return (
    <div className={`lt-team lt-team-${side}`}>
      {team.logo ? (
        <img className="lt-crest" src={team.logo} alt="" />
      ) : (
        <span className="lt-crest" aria-hidden="true">
          {badge}
        </span>
      )}
      <div>
        <h3 className="lt-team-name">{name}</h3>
        {!finished && team.isInPossession && (
          <p className="lt-possession">Ballbesitz</p>
        )}
      </div>
    </div>
  );
}

interface ScoreboardProps {
  game: Game;
}

export function Scoreboard({ game }: ScoreboardProps) {
  const finished = game.status === "beendet";
  const homeName = game.home.name || game.home.full_name;
  const awayName = game.away.name || game.away.full_name;
  const badges = teamBadges(homeName, awayName);
  const halves = halftimeLabel(game.home, game.away);
  const kickoff = game.scheduled_at
    ? formatBerlinClock(game.scheduled_at)
    : formatClock(game.time);
  const status = finished ? "Endstand" : "LIVE";
  const half = finished ? null : statusLabel(game.status);
  const field = game.field ? `Feld ${game.field}` : null;

  return (
    <section className="lt-board-card" aria-label="Spielstand">
      <p className={finished ? "lt-board-meta lt-final" : "lt-board-meta"}>
        {!finished && <span className="lt-live-dot" aria-hidden="true" />}
        <span className="lt-meta-status">
          {status}
          {half ? ` · ${half}` : null}
        </span>
        <span className="lt-meta-sep" aria-hidden="true">
          ·
        </span>
        <span className="lt-meta-context">
          {field ? `${field} · ` : null}
          {game.stage ? (
            <span className="lt-meta-stage">{`${game.stage} · `}</span>
          ) : null}
          {`Anstoß ${kickoff}`}
        </span>
      </p>
      <div className="lt-board">
        <TeamSide
          team={game.home}
          side="home"
          finished={finished}
          badge={badges.home}
        />
        <div className="lt-score">
          <span>{game.home.score ?? 0}</span>
          <span className="lt-colon">:</span>
          <span>{game.away.score ?? 0}</span>
        </div>
        <TeamSide
          team={game.away}
          side="away"
          finished={finished}
          badge={badges.away}
        />
      </div>
      {halves && <p className="lt-halves-line">{halves}</p>}
      {halves && (
        <table className="lt-halves" aria-label="Halbzeitergebnisse">
          <thead>
            <tr>
              <th scope="col">
                <span className="lt-sr">Team</span>
              </th>
              <th scope="col">1.</th>
              <th scope="col">2.</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{homeName}</td>
              <td>{game.home.fh ?? "–"}</td>
              <td>{game.home.sh ?? "–"}</td>
            </tr>
            <tr>
              <td>{awayName}</td>
              <td>{game.away.fh ?? "–"}</td>
              <td>{game.away.sh ?? "–"}</td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
