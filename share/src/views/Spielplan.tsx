import { useMemo, useState } from 'react';

import { TeamBlock } from '../components/TeamBlock';
import { WidgetShell } from '../components/WidgetShell';
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
    <WidgetShell config={config}>
      {config.teams.map((teamId) => (
        <TeamSchedule
          key={teamId}
          snapshot={snapshot}
          config={config}
          teamId={teamId}
        />
      ))}
    </WidgetShell>
  );
}
