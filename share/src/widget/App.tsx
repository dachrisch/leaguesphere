import { useMemo } from 'react';

import { ErrorBanner } from '../components/ErrorBanner';
import { PoweredBy } from '../components/PoweredBy';
import { useAutoHeight } from '../hooks/useAutoHeight';
import { useSnapshot, type SnapshotPolling } from '../hooks/useSnapshot';
import type { SnapshotFilters, SnapshotInclude } from '../lib/api';
import { filterToLatestSeason } from '../lib/derived';
import { activeWatchedGames } from '../lib/live';
import { parseWidgetConfig, type WidgetConfig } from '../lib/params';
import { todayIso } from '../lib/schedule';
import type { Snapshot } from '../lib/types';
import { Live } from '../views/Live';
import { Spielplan } from '../views/Spielplan';
import { Table } from '../views/Table';

const LIVE_POLL_MS = 60_000;

function hasOpenGameToday(snapshot: Snapshot): boolean {
  const teamIds = snapshot.scope?.team ?? [];
  return activeWatchedGames(snapshot, teamIds).length > 0;
}

const LIVE_POLLING: SnapshotPolling = {
  intervalMs: LIVE_POLL_MS,
  shouldPoll: hasOpenGameToday,
};

/**
 * One snapshot request per view: names and logos always (`teams`), plus the
 * standings for the table view or today's live blocks for the live view.
 */
export function snapshotFilters(config: WidgetConfig, today: string): SnapshotFilters {
  if (config.view === 'live') {
    return {
      include: ['games', 'teams', 'live'],
      dateFrom: today,
      dateTo: today,
    };
  }
  const include: SnapshotInclude[] = ['games', 'teams'];
  if (config.view === 'table') {
    include.push('standings');
  }
  return {
    include,
    season: config.season ?? undefined,
    year: config.season === null ? (config.year ?? undefined) : undefined,
    league: config.league ?? undefined,
  };
}

export function App() {
  const config = parseWidgetConfig(new URLSearchParams(window.location.search));
  const isLive = config.view === 'live';
  const {
    snapshot: rawSnapshot,
    loading,
    error,
  } = useSnapshot(
    config.teams,
    snapshotFilters(config, todayIso()),
    isLive ? LIVE_POLLING : null
  );
  const defaultSeason =
    !isLive && config.season === null && config.year === null;
  const teamsKey = config.teams.join(',');
  const snapshot = useMemo(() => {
    if (rawSnapshot === null || !defaultSeason) {
      return rawSnapshot;
    }
    const ids = teamsKey === '' ? [] : teamsKey.split(',').map(Number);
    return filterToLatestSeason(rawSnapshot, ids);
  }, [rawSnapshot, defaultSeason, teamsKey]);
  useAutoHeight();

  if (config.teams.length === 0) {
    return <p className="share-empty">Kein Team konfiguriert.</p>;
  }
  if (error !== null) {
    return <ErrorBanner message={error} />;
  }
  if (loading || snapshot === null) {
    return <p className="share-loading">Lädt…</p>;
  }
  if (isLive) {
    // Today's scope is usually empty; the live view says so itself.
    return <Live snapshot={snapshot} config={config} />;
  }
  if (snapshot.gamedays.length === 0) {
    return (
      <div className="share-widget">
        <p className="share-empty">
          Für dieses Team liegen noch keine Spiele vor.
        </p>
        <PoweredBy />
      </div>
    );
  }
  if (config.view === 'table') {
    return <Table snapshot={snapshot} config={config} />;
  }
  return <Spielplan snapshot={snapshot} config={config} />;
}
