import type { Game, ApiTeam } from "../api/types";

type Props = {
  game: Game;
  onOpen: (teamId: number, gamedayId: number) => void;
};

function TeamRow({
  team,
  gamedayId,
  onOpen,
}: {
  team: ApiTeam;
  gamedayId: number;
  onOpen: Props["onOpen"];
}) {
  return (
    <button
      type="button"
      className={team.isChecked ? "team-row checked" : "team-row"}
      onClick={() => onOpen(team.id, gamedayId)}
    >
      <span className="team-name">{team.name}</span>
      <span className={team.isChecked ? "chip checked" : "chip"}>
        {team.isChecked ? "geprüft" : "offen"}
      </span>
    </button>
  );
}

function GameCard({ game, onOpen }: Props) {
  return (
    <article className="game-card">
      <header className="game-head">
        <span className="game-time">{game.scheduled.slice(0, 5)} Uhr</span>
        <span className="game-field">Feld {game.field}</span>
      </header>
      <TeamRow team={game.home} gamedayId={game.gameday_id} onOpen={onOpen} />
      <TeamRow team={game.away} gamedayId={game.gameday_id} onOpen={onOpen} />
    </article>
  );
}

export default GameCard;
