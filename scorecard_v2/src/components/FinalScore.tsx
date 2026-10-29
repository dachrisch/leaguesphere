import type { GameLogTeam } from "../api/types";

interface FinalScoreProps {
  home: GameLogTeam;
  away: GameLogTeam;
}

function displayName(team: GameLogTeam): string {
  const name = team.name?.trim();
  return name === undefined || name === "" ? "–" : name;
}

/**
 * The result as a static board: final score and the two halves.
 *
 * Shared by the finalise and the result screen so both show the same numbers,
 * read from the same place — the log payload the server sent, never a sum the
 * client worked out.
 */
export default function FinalScore({ home, away }: FinalScoreProps) {
  const homeName = displayName(home);
  const awayName = displayName(away);

  return (
    <section aria-label="Spielstand" className="finalboard">
      <p className="finalpair">
        <span className="finalteam finalhome">{homeName}</span>
        <span aria-hidden="true" className="finalpoints">
          {home.score}
          <span className="finalsep">:</span>
          {away.score}
        </span>
        <span className="sr-only">
          {`${homeName} ${home.score} zu ${away.score} ${awayName}`}
        </span>
        <span className="finalteam finalaway">{awayName}</span>
      </p>
      <table className="finalhalves">
        <caption className="sr-only">Halbzeit-Ergebnisse</caption>
        <thead>
          <tr>
            <th scope="col">Halbzeit</th>
            <th scope="col">1.</th>
            <th scope="col">2.</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{homeName}</th>
            <td>{home.firsthalf.score}</td>
            <td>{home.secondhalf.score}</td>
          </tr>
          <tr>
            <th scope="row">{awayName}</th>
            <td>{away.firsthalf.score}</td>
            <td>{away.secondhalf.score}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
