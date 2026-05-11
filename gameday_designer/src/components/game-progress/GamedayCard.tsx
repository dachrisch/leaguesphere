import React from 'react';
import { useTypedTranslation } from '../../i18n/useTypedTranslation';
import ProgressBar from './ProgressBar';
import styles from './styles.module.css';
import type { GamedayWithStats, GameInfo } from '../../types/progressTypes';

interface GamedayCardProps {
  gameday: GamedayWithStats;
  isLive?: boolean;
}

function addHours(timeStr: string, hours: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  return `${String((h + hours) % 24).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`;
}

function getLastGameTime(games: GameInfo[]): string | null {
  if (games.length === 0) return null;
  let lastScheduled = games[0].scheduled;
  for (const game of games) {
    if (game.scheduled > lastScheduled) {
      lastScheduled = game.scheduled;
    }
  }
  return lastScheduled;
}

const GamedayCard: React.FC<GamedayCardProps> = ({ gameday, isLive = false }) => {
  const { t } = useTypedTranslation(['ui']);
  const { stats } = gameday;
  const lastGameTime = getLastGameTime(gameday.games);
  const endTime = lastGameTime ? addHours(lastGameTime, 2) : (gameday.start ? addHours(gameday.start, 2) : '');

  return (
    <div className={`${styles.gamedayCard} ${isLive ? styles.cardLive : ''}`}>
      <div className={styles.cardTop}>
        <div className={styles.cardHeader}>
          {isLive && <span className={styles.liveBadge}>● LIVE</span>}
          {gameday.isStale ? (
            <span className={`${styles.timeUntil} ${styles.stale}`}>{t('ui:gameProgress.card.stale')}</span>
          ) : (
            gameday.minutesUntilStart !== undefined && (
              <span className={styles.timeUntil}>
                {t('ui:gameProgress.card.minutesUntil', { minutes: gameday.minutesUntilStart })}
              </span>
            )
          )}
          <span className={styles.league}>{gameday.league_display}</span>
        </div>
      </div>

      <h3 className={styles.gamedayName}>{gameday.name}</h3>

      <div className={styles.gamedayMeta}>
        <span className={styles.date}>
          {new Date(gameday.date).toLocaleDateString(undefined, {
            weekday: 'short',
            month: '2-digit',
            day: '2-digit',
          })}
        </span>
        <span className={styles.timeRange}>
          {gameday.start}–{endTime}
        </span>
      </div>

      {isLive && <ProgressBar total={stats.total} played={stats.played} live={stats.live} />}

      <div className={styles.cardStats}>
        {gameday.minutesUntilStart === undefined && stats.played === 0 && stats.live === 0 ? (
          <span>{t('ui:gameProgress.card.gamesScheduled', { count: stats.total })}</span>
        ) : (
          <>
            <span>
              {t('ui:gameProgress.card.played', { played: stats.played, total: stats.total })}
            </span>
            {stats.live > 0 && (
              <span className={styles.liveCount}>{t('ui:gameProgress.card.live', { count: stats.live })}</span>
            )}
            {stats.pending > 0 && (
              <span className={styles.pendingCount}>{t('ui:gameProgress.card.pending', { count: stats.pending })}</span>
            )}
          </>
        )}
        {isLive && <span className={styles.percentComplete}>{stats.percentComplete}%</span>}
      </div>
    </div>
  );
};

export default GamedayCard;
