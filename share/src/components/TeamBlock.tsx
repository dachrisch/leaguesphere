import type { ScheduleEntry } from '../lib/schedule';
import { GameRow } from './GameRow';

function GameTable({
  entries,
  resultColumn,
}: {
  entries: ScheduleEntry[];
  resultColumn: 'Ergebnis' | 'Anpfiff';
}) {
  return (
    <table className="table table-sm table-hover mb-0">
      <thead>
        <tr>
          <th>Datum</th>
          <th />
          <th>Gegner</th>
          <th className="text-end">{resultColumn}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <GameRow key={entry.gameId} entry={entry} />
        ))}
      </tbody>
    </table>
  );
}

export function TeamBlock({
  past,
  upcoming,
  teamName,
  teamLogo = null,
  showPast,
  showFuture,
  pastLimit,
  futureLimit,
  showTitle,
  showAllPast,
  onShowAllPast,
}: {
  past: ScheduleEntry[];
  upcoming: ScheduleEntry[];
  teamName: string;
  teamLogo?: string | null;
  showPast: boolean;
  showFuture: boolean;
  pastLimit: number;
  futureLimit: number;
  showTitle: boolean;
  showAllPast: boolean;
  onShowAllPast: () => void;
}) {
  const visiblePast = showAllPast
    ? past
    : pastLimit > 0
      ? past.slice(-pastLimit)
      : past;
  const hiddenPast = past.length - visiblePast.length;
  const visibleUpcoming =
    futureLimit > 0 ? upcoming.slice(0, futureLimit) : upcoming;

  return (
    <section className="content-section">
      {showTitle && teamName && (
        <h2 className="share-team__name">
          {teamLogo !== null && (
            <img className="share-team-logo" src={teamLogo} alt="" />
          )}
          {teamName}
        </h2>
      )}

      {showPast && (
        <div className="share-section">
          <h3 className="share-section__title">Vergangene Spiele</h3>
          {visiblePast.length === 0 ? (
            <p className="share-empty">Noch keine Ergebnisse.</p>
          ) : (
            <GameTable entries={visiblePast} resultColumn="Ergebnis" />
          )}
          {hiddenPast > 0 && !showAllPast && (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary mt-2"
              onClick={onShowAllPast}
            >
              Weitere {hiddenPast} anzeigen
            </button>
          )}
        </div>
      )}

      {showFuture && (
        <div className="share-section">
          <h3 className="share-section__title">Kommende Spiele</h3>
          {visibleUpcoming.length === 0 ? (
            <p className="share-empty">Keine kommenden Spiele.</p>
          ) : (
            <GameTable entries={visibleUpcoming} resultColumn="Anpfiff" />
          )}
        </div>
      )}
    </section>
  );
}
