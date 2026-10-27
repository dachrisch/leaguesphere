import type { KeyboardEvent } from "react";

import type { RosterEntry } from "../api/types";

type Props = {
  player: RosterEntry;
  jerseyNumber?: number;
  checked: boolean;
  onToggle: () => void;
  onOpenPlayer: () => void;
  onOpenPhoto?: () => void;
};

function PlayerRow({
  player,
  jerseyNumber = player.jersey_number,
  checked,
  onToggle,
  onOpenPlayer,
  onOpenPhoto,
}: Props) {
  const name = `${player.first_name} ${player.last_name}`;
  const blocked = Boolean(player.validationError);
  const classes = ["player-row"];
  if (checked) classes.push("checked");
  if (blocked) classes.push("blocked");

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
    }
  };

  return (
    <div
      className={classes.join(" ")}
      role="button"
      tabIndex={0}
      aria-label={name}
      aria-pressed={checked}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
    >
      {onOpenPhoto ? (
        <button
          type="button"
          className="player-photo"
          aria-label={`Foto von ${name}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpenPhoto();
          }}
        >
          Foto
        </button>
      ) : (
        <span className="player-photo" aria-hidden="true">
          Foto
        </span>
      )}
      <span className="player-main">
        <span className="player-name">{name}</span>
        {blocked && <span className="player-blocked">Prüfen</span>}
      </span>
      <button
        type="button"
        className="player-jersey"
        aria-label={`Trikotnummer von ${name} ändern`}
        onClick={(event) => {
          event.stopPropagation();
          onOpenPlayer();
        }}
      >
        {jerseyNumber}
      </button>
    </div>
  );
}

export default PlayerRow;
