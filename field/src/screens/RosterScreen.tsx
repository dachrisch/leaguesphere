import { useEffect, useMemo, useRef, useState } from "react";

import type { RosterEntry, RosterResponse } from "../api/types";
import PlayerRow from "../components/PlayerRow";
import UndoBar from "../components/UndoBar";
import { useSessionTimer } from "../hooks/useSessionTimer";

type Props = {
  roster: RosterResponse;
  onOpenPlayer: (player: RosterEntry) => void;
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
  onOpenPlayer,
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

  const [checkedIds, setCheckedIds] = useState<Set<number>>(
    () => new Set(players.filter((player) => player.isSelected).map((p) => p.id))
  );
  const [averageSeconds, setAverageSeconds] = useState<number | null>(null);
  const [undo, setUndo] = useState<RosterEntry | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const timer = useSessionTimer(clock);

  useEffect(() => {
    if (!undo) return;
    const timeout = window.setTimeout(() => setUndo(null), UNDO_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [undo]);

  const toggle = (player: RosterEntry) => {
    if (player.validationError) {
      onOpenPlayer(player);
      return;
    }

    const next = new Set(checkedIds);
    if (next.has(player.id)) {
      next.delete(player.id);
      setCheckedIds(next);
      setUndo(null);
      return;
    }

    const now = clock();
    if (startedAtRef.current === null) {
      startedAtRef.current = now;
    }
    timer.start();
    next.add(player.id);
    setCheckedIds(next);
    setUndo(player);
    setAverageSeconds((now - startedAtRef.current) / 1000 / next.size);
  };

  const undoLast = () => {
    if (!undo) return;
    const next = new Set(checkedIds);
    next.delete(undo.id);
    setCheckedIds(next);
    setAverageSeconds(null);
    setUndo(null);
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
            ←
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
