import { useMemo } from 'react';

import { ErrorBanner } from '../components/ErrorBanner';
import { PoweredBy } from '../components/PoweredBy';
import { useAutoHeight } from '../hooks/useAutoHeight';
import { useResolvedSeason } from '../hooks/useResolvedSeason';
import { useSnapshot } from '../hooks/useSnapshot';
import { filterToLatestSeason } from '../lib/derived';
import { parseWidgetConfig } from '../lib/params';
import { Live } from '../views/Live';
import { Spielplan } from '../views/Spielplan';
import { Table } from '../views/Table';

export function App() {
  const config = parseWidgetConfig(new URLSearchParams(window.location.search));
  const { seasonId, ready } = useResolvedSeason(config);
  const {
    snapshot: rawSnapshot,
    loading,
    error,
  } = useSnapshot(
    config.teams,
    {
      season: seasonId ?? undefined,
      league: config.league ?? undefined,
    },
    ready
  );
  const defaultSeason = config.season === null && config.year === null;
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
  if (config.view === 'live') {
    return <Live snapshot={snapshot} config={config} />;
  }
  if (config.view === 'table') {
    return <Table snapshot={snapshot} config={config} seasonId={seasonId} />;
  }
  return <Spielplan snapshot={snapshot} config={config} />;
}
