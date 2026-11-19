import type { Game, Team } from "../types";

interface TeamSideProps {
  team: Team;
  side: "home" | "away";
}

function TeamSide({ team, side }: TeamSideProps) {
  const name = team.name || team.full_name;
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div className={`lt-team lt-team-${side}`}>
      {team.logo ? (
        <img className="lt-crest" src={team.logo} alt="" />
      ) : (
        <span className="lt-crest" aria-hidden="true">
          {initials}
        </span>
      )}
      <div>
        <h3 className="lt-team-name">{name}</h3>
        <p className="lt-team-role">{side === "home" ? "Heim" : "Gast"}</p>
        {team.isInPossession && <p className="lt-possession">Ballbesitz</p>}
      </div>
    </div>
  );
}

interface ScoreboardProps {
  game: Game;
}

export function Scoreboard({ game }: ScoreboardProps) {
  const showHalves = game.home.fh !== null || game.home.sh !== null;
  return (
    <section className="lt-board-card" aria-label="Spielstand">
      <p className="lt-live-row">
        <span className="lt-live-dot" aria-hidden="true" />
        Live · {game.status}
      </p>
      <div className="lt-board">
        <TeamSide team={game.home} side="home" />
        <div className="lt-score">
          <span>{game.home.score ?? 0}</span>
          <span className="lt-colon">:</span>
          <span>{game.away.score ?? 0}</span>
        </div>
        <TeamSide team={game.away} side="away" />
      </div>
      {showHalves && (
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
              <td>{game.home.name}</td>
              <td>{game.home.fh ?? "–"}</td>
              <td>{game.home.sh ?? "–"}</td>
            </tr>
            <tr>
              <td>{game.away.name}</td>
              <td>{game.away.fh ?? "–"}</td>
              <td>{game.away.sh ?? "–"}</td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
