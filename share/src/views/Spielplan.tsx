import { useMemo, useState } from 'react';

import { PoweredBy } from '../components/PoweredBy';
import { TeamBlock } from '../components/TeamBlock';
import type { WidgetConfig } from '../lib/params';
import { buildTeamSchedule } from '../lib/schedule';
import type { Snapshot } from '../lib/types';

function TeamSchedule({
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

  return (
    <TeamBlock
      past={schedule.past}
      upcoming={schedule.upcoming}
      teamName={schedule.teamName}
      showPast={config.showPast}
      showFuture={config.showFuture}
      pastLimit={config.past}
      futureLimit={config.future}
      showTitle={config.title}
      showAllPast={showAllPast}
      onShowAllPast={() => setShowAllPast(true)}
    />
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
    <div className={`share-widget${config.compact ? ' text-body' : ''}`}>
      {config.teams.map((teamId) => (
        <TeamSchedule
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
