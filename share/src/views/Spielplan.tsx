import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

import { GameRow } from '../components/GameRow';
import { PoweredBy } from '../components/PoweredBy';
import type { WidgetConfig } from '../lib/params';
import { buildTeamSchedule } from '../lib/schedule';
import type { Snapshot } from '../lib/types';

function TeamBlock({
  snapshot,
  config,
  teamId,
}: {
  snapshot: Snapshot;
  config: WidgetConfig;
  teamId: number;
}) {
  const schedule = useMemo(
    () => buildTeamSchedule(snapshot, teamId),
    [snapshot, teamId]
  );
  const [showAllPast, setShowAllPast] = useState(false);

  const pastLimit = config.past > 0 ? config.past : schedule.past.length;
  const visiblePast = showAllPast
    ? schedule.past
    : schedule.past.slice(-pastLimit);
  const hiddenPast = schedule.past.length - visiblePast.length;

  const upcoming =
    config.future > 0 ? schedule.upcoming.slice(0, config.future) : schedule.upcoming;

  return (
    <section className="share-team">
      {config.title && schedule.teamName && (
        <h2 className="share-team__name">{schedule.teamName}</h2>
      )}

      {config.showPast && (
        <div className="share-section">
          <h3 className="share-section__title">Vergangene Spiele</h3>
          {visiblePast.length === 0 ? (
            <p className="share-empty">Noch keine Ergebnisse.</p>
          ) : (
            <ul className="share-games">
              {visiblePast.map((entry) => (
                <GameRow key={entry.gameId} entry={entry} />
              ))}
            </ul>
          )}
          {hiddenPast > 0 && !showAllPast && (
            <button
              type="button"
              className="share-more"
              onClick={() => setShowAllPast(true)}
            >
              Weitere {hiddenPast} anzeigen
            </button>
          )}
        </div>
      )}

      {config.showFuture && (
        <div className="share-section">
          <h3 className="share-section__title">Kommende Spiele</h3>
          {upcoming.length === 0 ? (
            <p className="share-empty">Keine kommenden Spiele.</p>
          ) : (
            <ul className="share-games">
              {upcoming.map((entry) => (
                <GameRow key={entry.gameId} entry={entry} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export function Spielplan({
  snapshot,
  config,
}: {
  snapshot: Snapshot;
  config: WidgetConfig;
}) {
  if (config.teams.length === 0) {
    return <p className="share-empty">Kein Team konfiguriert.</p>;
  }
  return (
    <div
      className={`share-widget${config.compact ? ' share-widget--compact' : ''}`}
      style={{ '--share-accent': `#${config.color}` } as CSSProperties}
    >
      {config.teams.map((teamId) => (
        <TeamBlock
          key={teamId}
          snapshot={snapshot}
          config={config}
          teamId={teamId}
        />
      ))}
      <PoweredBy show={config.poweredBy} />
    </div>
  );
}
