import { useState } from 'react';

import type { ScheduleEntry } from '../lib/schedule';

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

export function GameRow({ entry }: { entry: ScheduleEntry }) {
  const [logoFailed, setLogoFailed] = useState(false);
  return (
    <tr className={entry.isLive ? 'table-warning' : undefined}>
      <td className="text-nowrap">{formatDate(entry.date)}</td>
      <td className="text-muted">{entry.isHome ? 'H' : 'A'}</td>
      <td className="text-start">
        {entry.opponentLogo !== null && !logoFailed && (
          <img
            className="share-team-logo"
            src={entry.opponentLogo}
            alt=""
            onError={() => setLogoFailed(true)}
          />
        )}
        {entry.opponent}
      </td>
      <td className="text-end fw-semibold text-nowrap">
        {entry.isFinal ? (
          // Always home : away, matching the H/A column, not own : opponent.
          `${entry.homeScore} : ${entry.awayScore}`
        ) : entry.isLive ? (
          <span className="badge text-bg-danger">LIVE</span>
        ) : (
          <span className="text-muted">{entry.time}</span>
        )}
      </td>
    </tr>
  );
}
