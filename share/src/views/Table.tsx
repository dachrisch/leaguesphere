import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

import { ErrorBanner } from '../components/ErrorBanner';
import { PoweredBy } from '../components/PoweredBy';
import { StandingsTable } from '../components/StandingsTable';
import { fetchLeagueTable, fetchLeagues } from '../lib/api';
import type { WidgetConfig } from '../lib/params';
import { pickLeagueSeason, slugify } from '../lib/table';
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
  const seasonName = picked?.seasonName;

  useEffect(() => {
    if (leagueName === undefined || seasonName === undefined) {
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
        const data = await fetchLeagueTable(league.slug, slugify(seasonName));
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
  }, [leagueName, seasonName]);

  return (
    <div
      className="share-widget"
      style={{ '--share-accent': `#${config.color}` } as CSSProperties}
    >
      <h2 className="share-team__name">
        {picked ? `${picked.leagueName} ${picked.seasonName}` : 'Tabelle'}
      </h2>
      {error !== null ? (
        <ErrorBanner message={error} />
      ) : table !== null ? (
        <StandingsTable table={table} highlightTeamIds={config.teams} />
      ) : (
        <p className="share-loading">Lädt…</p>
      )}
      <PoweredBy show={config.poweredBy} />
    </div>
  );
}
