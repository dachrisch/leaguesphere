import { useEffect, useMemo, useState } from "react";

import type {
  RosterEntry,
  RosterResponse,
  RosterWriteEntry,
} from "../api/types";
import PlayerRow from "../components/PlayerRow";
import UndoBar from "../components/UndoBar";
import { useSessionTimer } from "../hooks/useSessionTimer";

type Props = {
  roster: RosterResponse;
  checkedIds: Set<number>;
  onToggle: (player: RosterEntry) => void;
  onOpenPlayer: (player: RosterEntry) => void;
  jerseyOverrides?: Record<number, number>;
  onFinalize?: (entries: RosterWriteEntry[]) => void;
  onBack?: () => void;
  onOpenPhoto?: (player: RosterEntry) => void;
  clock?: () => number;
  pendingCount?: number;
};

const UNDO_TIMEOUT_MS = 5000;

function formatSeconds(seconds: number): string {
  if (Number.isInteger(seconds)) {
    return `${seconds}`;
  }
  return seconds.toFixed(1).replace(".", ",");
}

function RosterScreen({
  roster,
  checkedIds,
  onToggle,
  onOpenPlayer,
  jerseyOverrides = {},
  onFinalize,
  onBack,
  onOpenPhoto,
  clock = Date.now,
  pendingCount = 0,
}: Props) {
  const sections = useMemo(
    () => [
      { name: roster.team.name, players: roster.team.roster },
      ...roster.additionalTeams.map((team) => ({
        name: team.name,
        players: team.roster,
      })),
    ],
    [roster]
  );
  const players = useMemo(
    () => sections.flatMap((section) => section.players),
    [sections]
  );

  const [undo, setUndo] = useState<RosterEntry | null>(null);
  const timer = useSessionTimer(clock);

  useEffect(() => {
    if (!undo) return;
    const timeout = window.setTimeout(() => setUndo(null), UNDO_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [undo]);

  const averageSeconds =
    checkedIds.size > 0 && timer.startedAt !== null
      ? timer.elapsedMs / 1000 / checkedIds.size
      : null;

  const toggle = (player: RosterEntry) => {
    if (player.validationError) {
      onOpenPlayer(player);
      return;
    }
    if (checkedIds.has(player.id)) {
      setUndo(null);
    } else {
      timer.start();
      setUndo(player);
    }
    onToggle(player);
  };

  const undoLast = () => {
    if (!undo) return;
    onToggle(undo);
    setUndo(null);
  };

  const finalize = () => {
    if (!onFinalize) return;
    onFinalize(
      players
        .filter((player) => checkedIds.has(player.id))
        .map((player) => ({
          id: player.id,
          jersey_number: jerseyOverrides[player.id] ?? player.jersey_number,
        }))
    );
  };

  return (
    <section className="roster-screen">
      <header className="roster-head">
        {onBack && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Zurück"
            onClick={onBack}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              aria-hidden="true"
            >
              <path
                d="M15 5l-7 7 7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <div className="roster-title">
          <p className="field-kicker">Passcheck</p>
          <h1>{roster.team.name}</h1>
        </div>
      </header>

      <div className="roster-meter">
        <span className="roster-count">
          {checkedIds.size} von {players.length} geprüft
        </span>
        {averageSeconds !== null && (
          <span className="roster-average">
            Ø {formatSeconds(averageSeconds)} s/Spieler
          </span>
        )}
      </div>

      {pendingCount > 0 && (
        <p className="offline-banner" role="status">
          {pendingCount} Einträge warten auf Übertragung.
        </p>
      )}

      <div className="roster-list">
        {sections.map((section, index) => (
          <div key={`${section.name}-${index}`}>
            {index > 0 && <p className="group-head">{section.name}</p>}
            {section.players.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                jerseyNumber={
                  jerseyOverrides[player.id] ?? player.jersey_number
                }
                checked={checkedIds.has(player.id)}
                onToggle={() => toggle(player)}
                onOpenPlayer={() => onOpenPlayer(player)}
                onOpenPhoto={
                  onOpenPhoto ? () => onOpenPhoto(player) : undefined
                }
              />
            ))}
          </div>
        ))}
      </div>

      {onFinalize && (
        <div className="roster-actions">
          <button type="button" className="sheet-primary" onClick={finalize}>
            Prüfung abschließen
          </button>
        </div>
      )}

      {undo && (
        <UndoBar
          playerName={`${undo.first_name} ${undo.last_name}`}
          onUndo={undoLast}
          onDismiss={() => setUndo(null)}
        />
      )}
    </section>
  );
}

export default RosterScreen;
