import type { ScheduleEntry } from '../lib/schedule';

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

export function GameRow({ entry }: { entry: ScheduleEntry }) {
  return (
    <tr className={entry.isLive ? 'table-warning' : undefined}>
      <td className="text-nowrap">{formatDate(entry.date)}</td>
      <td className="text-muted">{entry.isHome ? 'H' : 'A'}</td>
      <td className="text-start">{entry.opponent}</td>
      <td className="text-end fw-semibold text-nowrap">
        {entry.isFinal ? (
          `${entry.teamScore} : ${entry.opponentScore}`
        ) : entry.isLive ? (
          <span className="badge text-bg-danger">LIVE</span>
        ) : (
          <span className="text-muted">{entry.time}</span>
        )}
      </td>
    </tr>
  );
}
