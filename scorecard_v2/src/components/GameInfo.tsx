import type {
  Game,
  GameLog,
  GameSetup,
  Official,
  TeamOfficial,
} from "../api/types";

interface GameInfoProps {
  game: Game;
  log: GameLog;
  setup: GameSetup | null;
  officials: Official[] | null;
  officialsUnavailable: boolean;
  people: TeamOfficial[];
}

function teamName(name: string | null): string {
  return name?.trim() || "–";
}

/** The coin toss uses the same current and legacy values as the start form. */
function tossWinner(
  setup: GameSetup | null,
  home: string | null,
  away: string | null,
): string {
  const value = setup?.ctResult?.trim().toLowerCase() ?? "";
  if (value === "gewonnen" || value === "won") {
    return teamName(away);
  }
  if (value === "verloren" || value === "lost") {
    return teamName(home);
  }
  if (value === "home") {
    return teamName(home);
  }
  if (value === "away") {
    return teamName(away);
  }
  if (home !== null && value === home.trim().toLowerCase()) {
    return teamName(home);
  }
  if (away !== null && value === away.trim().toLowerCase()) {
    return teamName(away);
  }
  return "–";
}

function direction(setup: GameSetup | null): string {
  const value = setup?.direction?.trim().toLowerCase() ?? "";
  if (value === "") {
    return "–";
  }
  return value === "west" ||
    value === "directionright" ||
    value === "arrow_forward"
    ? "West"
    : "Ost";
}

function officialName(
  row: Official,
  people: Map<number, TeamOfficial>,
): string {
  if (row.official !== null) {
    const person = people.get(row.official);
    if (person !== undefined) {
      return `${person.first_name} ${person.last_name}`.trim();
    }
  }
  return row.name?.trim() || "–";
}

/** Desktop-only context; every value comes from the loaded game, log or setup. */
export default function GameInfo({
  game,
  log,
  setup,
  officials,
  officialsUnavailable,
  people,
}: GameInfoProps) {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const passcheck =
    game.passcheck === true
      ? "Geprüft"
      : game.passcheck === false
        ? "Nicht geprüft"
        : "Unbekannt";

  return (
    <aside aria-label="Spielinfo" className="tracking-info">
      <section className="infocard">
        <h2>Spiel</h2>
        <dl className="infolist">
          <div>
            <dt>Anstoß</dt>
            <dd>
              {game.scheduled.slice(0, 5) || "–"} · Feld {game.field}
            </dd>
          </div>
          <div>
            <dt>Münzwurf</dt>
            <dd>{tossWinner(setup, log.home.name, log.away.name)}</dd>
          </div>
          <div>
            <dt>Spielrichtung</dt>
            <dd>{direction(setup)}</dd>
          </div>
          <div>
            <dt>Passcheck</dt>
            <dd>{passcheck}</dd>
          </div>
        </dl>
      </section>

      <section className="infocard">
        <h2>Offizielle</h2>
        {officials === null ? (
          <p className="infoempty">
            {officialsUnavailable
              ? "Offizielle konnten nicht geladen werden"
              : "Offizielle werden geladen …"}
          </p>
        ) : officials.length === 0 ? (
          <p className="infoempty">Keine Offiziellen eingetragen</p>
        ) : (
          <dl className="infolist">
            {officials.map((row) => (
              <div key={row.id}>
                <dt>{row.position}</dt>
                <dd>{officialName(row, peopleById)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="infocard">
        <h2>Halbzeiten</h2>
        <table aria-label="Halbzeiten" className="infohalves">
          <thead>
            <tr>
              <th scope="col">Team</th>
              <th scope="col">1.</th>
              <th scope="col">2.</th>
              <th scope="col">Ges.</th>
            </tr>
          </thead>
          <tbody>
            {[log.home, log.away].map((team) => (
              <tr key={team.id ?? team.name}>
                <th scope="row">{teamName(team.name)}</th>
                <td>{team.firsthalf.score}</td>
                <td>{team.secondhalf.score}</td>
                <td>{team.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </aside>
  );
}
