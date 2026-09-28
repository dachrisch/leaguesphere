import { useMemo } from 'react';

import { LiveCard } from '../components/LiveCard';
import { WidgetShell } from '../components/WidgetShell';
import { useLiveticker } from '../hooks/useLiveticker';
import { activeWatchedGames } from '../lib/live';
import type { WidgetConfig } from '../lib/params';
import type { Snapshot } from '../lib/types';

export function Live({
  snapshot,
  config,
}: {
  snapshot: Snapshot;
  config: WidgetConfig;
}) {
  const watched = useMemo(
    () => activeWatchedGames(snapshot, config.teams),
    [snapshot, config.teams]
  );
  const liveFeed = useLiveticker(watched.length > 0);
  const watchedIds = new Set(watched.map((game) => game.gameId));
  const games = liveFeed.filter((game) => watchedIds.has(game.gameId));

  return (
    <WidgetShell config={config}>
      <h2 className="share-team__name">Live</h2>
      {games.length === 0 ? (
        <div className="content-section">
          <p className="share-empty">Kein Live-Spiel gerade.</p>
        </div>
      ) : (
        games.map((game) => <LiveCard key={game.gameId} game={game} />)
      )}
    </WidgetShell>
  );
}
