import { useMemo } from 'react';

import { LiveCard } from '../components/LiveCard';
import { WidgetShell } from '../components/WidgetShell';
import { liveGames } from '../lib/live';
import type { WidgetConfig } from '../lib/params';
import type { Snapshot } from '../lib/types';

/** Today's open games of the watched teams; the app re-polls the snapshot. */
export function Live({
  snapshot,
  config,
}: {
  snapshot: Snapshot;
  config: WidgetConfig;
}) {
  const games = useMemo(
    () => liveGames(snapshot, config.teams),
    [snapshot, config.teams]
  );

  return (
    <WidgetShell config={config}>
      <h2 className="share-team__name">Live</h2>
      {games.length === 0 ? (
        <div className="content-section">
          <p className="share-empty">Kein Live-Spiel gerade.</p>
        </div>
      ) : (
        games.map((game) => (
          <LiveCard
            key={game.gameId}
            game={game}
            liveUrl={config.liveUrl}
          />
        ))
      )}
    </WidgetShell>
  );
}
