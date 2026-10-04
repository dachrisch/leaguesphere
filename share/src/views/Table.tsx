import { ErrorBanner } from '../components/ErrorBanner';
import { StandingsTable } from '../components/StandingsTable';
import { WidgetShell } from '../components/WidgetShell';
import type { WidgetConfig } from '../lib/params';
import { visibleStandings } from '../lib/table';
import type { Snapshot } from '../lib/types';

/**
 * Standings straight from the snapshot (`include=standings`): one table per
 * league the teams play in that has a table; cups have none and never show.
 */
export function Table({
  snapshot,
  config,
}: {
  snapshot: Snapshot;
  config: WidgetConfig;
}) {
  const tables = visibleStandings(snapshot, config.league);

  return (
    <WidgetShell config={config}>
      {tables.length === 0 ? (
        <div className="content-section">
          <ErrorBanner message="Tabelle nicht verfügbar." />
        </div>
      ) : (
        tables.map((table) => (
          <div
            className="content-section"
            key={`${table.league.id}-${table.season.id}`}
          >
            <h2 className="share-team__name">
              {table.league.name} {table.season.name}
            </h2>
            <StandingsTable table={table} highlightTeamIds={config.teams} />
          </div>
        ))
      )}
    </WidgetShell>
  );
}
