import type { ScheduleEntry } from '@/lib/schedule';

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

export function GameRow({ entry }: { entry: ScheduleEntry }) {
  const result = entry.isFinal ? `${entry.teamScore} : ${entry.opponentScore}` : null;
  return (
    <li
      className={`share-game${entry.isLive ? ' share-game--live' : ''}`}
      data-testid={`game-${entry.gameId}`}
    >
      <span className="share-game__date">{formatDate(entry.date)}</span>
      <span className="share-game__opponent">
        <span className="share-game__venue">{entry.isHome ? 'H' : 'A'}</span>
        {entry.opponent}
      </span>
      <span className="share-game__result">
        {entry.isFinal ? (
          result
        ) : entry.isLive ? (
          <span className="share-game__live">LIVE</span>
        ) : (
          entry.time
        )}
      </span>
    </li>
  );
}
