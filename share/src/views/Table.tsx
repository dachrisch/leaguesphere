import { useEffect, useMemo, useState } from 'react';

import { ErrorBanner } from '../components/ErrorBanner';
import { StandingsTable } from '../components/StandingsTable';
import { WidgetShell } from '../components/WidgetShell';
import { fetchLeagueTable, fetchLeagues, fetchSeasons } from '../lib/api';
import type { WidgetConfig } from '../lib/params';
import {
  leagueCandidates,
  slugify,
  type LeagueCandidate,
} from '../lib/table';
import type { LeagueTable, Snapshot } from '../lib/types';

/**
 * Candidate leagues to try, most games first. An explicit `league=` collapses
 * this to that one league so a club's choice is never silently overridden.
 */
function resolveCandidates(
  snapshot: Snapshot,
  explicitLeague: number | null
): LeagueCandidate[] {
  const all = leagueCandidates(snapshot);
  if (explicitLeague === null) {
    return all;
  }
  const explicit = all.find((candidate) => candidate.id === explicitLeague);
  return explicit !== undefined
    ? [explicit]
    : [{ id: explicitLeague, name: '', gameCount: 0 }];
}

export function Table({
  snapshot,
  config,
  seasonId = null,
}: {
  snapshot: Snapshot;
  config: WidgetConfig;
  seasonId?: number | null;
}) {
  const candidates = useMemo(
    () => resolveCandidates(snapshot, config.league),
    [snapshot, config.league]
  );
  const [table, setTable] = useState<LeagueTable | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const leagues = await fetchLeagues();
        let seasonSlug: string | undefined;
        if (seasonId !== null) {
          const seasons = await fetchSeasons();
          const season = seasons.find((entry) => entry.id === seasonId);
          if (season !== undefined) {
            seasonSlug = slugify(season.name);
          }
        }
        let found: LeagueTable | null = null;
        for (const candidate of candidates) {
          const league =
            leagues.find((entry) => entry.id === candidate.id) ??
            leagues.find((entry) => entry.name === candidate.name);
          if (league === undefined) {
            continue;
          }
          try {
            found = await fetchLeagueTable(league.slug, seasonSlug);
            break;
          } catch {
            /* no table for this league (e.g. a cup) — try the next one */
          }
        }
        if (!active) {
          return;
        }
        if (found !== null) {
          setTable(found);
          setError(null);
        } else {
          setTable(null);
          setError('Tabelle nicht verfügbar.');
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
  }, [candidates, seasonId]);

  const heading =
    table !== null
      ? `${table.league.name} ${table.season.name}`
      : candidates[0]?.name || 'Tabelle';

  return (
    <WidgetShell config={config}>
      <div className="content-section">
        <h2 className="share-team__name">{heading}</h2>
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
