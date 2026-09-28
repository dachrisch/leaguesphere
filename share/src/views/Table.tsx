import { useEffect, useMemo, useState } from 'react';

import { ErrorBanner } from '../components/ErrorBanner';
import { StandingsTable } from '../components/StandingsTable';
import { WidgetShell } from '../components/WidgetShell';
import { fetchLeagueTable, fetchLeagues } from '../lib/api';
import type { WidgetConfig } from '../lib/params';
import { pickLeagueSeason } from '../lib/table';
import type { LeagueTable, Snapshot } from '../lib/types';

export function Table({
  snapshot,
  config,
}: {
  snapshot: Snapshot;
  config: WidgetConfig;
}) {
  const picked = useMemo(
    () => pickLeagueSeason(snapshot, config.teams),
    [snapshot, config.teams]
  );
  const [table, setTable] = useState<LeagueTable | null>(null);
  const [error, setError] = useState<string | null>(null);

  const leagueName = picked?.leagueName;

  useEffect(() => {
    if (leagueName === undefined) {
      return;
    }
    let active = true;
    (async () => {
      try {
        const leagues = await fetchLeagues();
        const league = leagues.find((entry) => entry.name === leagueName);
        if (league === undefined) {
          throw new Error(`unknown league ${leagueName}`);
        }
        // No season slug: the API resolves to the latest season for the
        // league, avoiding any display-name -> slug guessing.
        const data = await fetchLeagueTable(league.slug);
        if (active) {
          setTable(data);
          setError(null);
        }
      } catch {
        if (active) {
          setTable(null);
          setError('Tabelle nicht verfügbar.');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [leagueName]);

  return (
    <WidgetShell config={config}>
      <div className="content-section">
        <h2 className="share-team__name">
          {table !== null
            ? `${table.league.name} ${table.season.name}`
            : picked
              ? picked.leagueName
              : 'Tabelle'}
        </h2>
        {error !== null ? (
          <ErrorBanner message={error} />
        ) : table !== null ? (
          <StandingsTable table={table} highlightTeamIds={config.teams} />
        ) : (
          <p className="share-loading">Lädt…</p>
        )}
      </div>
    </WidgetShell>
  );
}
