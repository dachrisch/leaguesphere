import { useState } from "react";

import type { RosterPlayer } from "../api/types";
import JerseyPicker from "./JerseyPicker";

interface QuarterbackPickProps {
  /** Both sides as loaded from the API, `null` while the request runs. */
  roster: RosterPlayer[] | null;
  /** Side of the team whose quarterback is picked. */
  side: RosterPlayer["side"];
  value: number | null;
  onChange: (jersey: number | null) => void;
  disabled?: boolean;
  /** Section heading; the picker is one row inside the sheet. */
  label?: string;
}

/**
 * The quarterback of one team, as the common case needs it.
 *
 * Nine passes in ten come from the same person, so the sheet only shows the
 * number and an "ändern" button; the full jersey grid is one tap away for the
 * rare change (the operator's game-9316 request). A side without a remembered
 * quarterback opens the grid right away.
 */
export default function QuarterbackPick({
  roster,
  side,
  value,
  onChange,
  disabled = false,
  label = "Quarterback",
}: QuarterbackPickProps) {
  const [editing, setEditing] = useState(false);
  const players =
    roster === null ? [] : roster.filter((player) => player.side === side);
  const open = editing || value === null;

  if (!open && value !== null) {
    return (
      <div aria-label={label} className="qbpick" role="group">
        <span className="qbpick-label">{label}</span>
        <span className="qbpick-value">#{value}</span>
        <button
          className="qbpick-change"
          disabled={disabled}
          onClick={() => setEditing(true)}
          type="button"
        >
          ändern
        </button>
      </div>
    );
  }

  return (
    <JerseyPicker
      compact
      disabled={disabled}
      groupLabel={`Trikotnummer ${label}`}
      label="QB"
      onChange={(jersey) => {
        onChange(jersey);
        setEditing(false);
      }}
      optionalLabel="Ohne QB"
      players={players}
      value={value}
    />
  );
}
