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
  const [tables, setTables] = useState<LeagueTable[]>([]);
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
        // Try every candidate: a club may appear in more than one league
        // (e.g. league and cup). Cups without a standings endpoint 404 and are
        // skipped; each league that returns a table gets its own view.
        const found: LeagueTable[] = [];
        for (const candidate of candidates) {
          const league =
            leagues.find((entry) => entry.id === candidate.id) ??
            leagues.find((entry) => entry.name === candidate.name);
          if (league === undefined) {
            continue;
          }
          try {
            found.push(await fetchLeagueTable(league.slug, seasonSlug));
          } catch {
            /* no table for this league (e.g. a cup) — skip it */
          }
        }
        if (!active) {
          return;
        }
        setTables(found);
        setError(found.length > 0 ? null : 'Tabelle nicht verfügbar.');
      } catch {
        if (active) {
          setTables([]);
          setError('Tabelle nicht verfügbar.');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [candidates, seasonId]);

  return (
    <WidgetShell config={config}>
      {error !== null ? (
        <div className="content-section">
          <ErrorBanner message={error} />
        </div>
      ) : tables.length > 0 ? (
        tables.map((table) => (
          <div
            className="content-section"
            key={`${table.league.slug}-${table.season.slug}`}
          >
            <h2 className="share-team__name">
              {table.league.name} {table.season.name}
            </h2>
            <StandingsTable table={table} highlightTeamIds={config.teams} />
          </div>
        ))
      ) : (
        <div className="content-section">
          <p className="share-loading">Lädt…</p>
        </div>
      )}
    </WidgetShell>
  );
}
