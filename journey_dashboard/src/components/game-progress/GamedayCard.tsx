import React from 'react';
import { useTypedTranslation } from '../../i18n/useTypedTranslation';
import ProgressBar from './ProgressBar';
import styles from './styles.module.css';
import type { GamedayWithStats } from '../../types/progressTypes';
import { getLastGameTime } from './utils/gameTimeUtils';

interface GamedayCardProps {
  gameday: GamedayWithStats;
  isLive?: boolean;
}

function addHours(timeStr: string, hours: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  return `${String((h + hours) % 24).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`;
}

const GamedayCard: React.FC<GamedayCardProps> = ({ gameday, isLive = false }) => {
  const { t } = useTypedTranslation(['ui']);
  const { stats } = gameday;
  const lastGameTime = getLastGameTime(gameday.games);
  const endTime = lastGameTime ? addHours(lastGameTime, 2) : (gameday.start ? addHours(gameday.start, 2) : '');
  const gamedayUrl = `/gamedays/gameday/${gameday.id}/`;

  const isActuallyLive = stats.live > 0 || (stats.played > 0 && stats.pending > 0);
  const isFinished = stats.played === stats.total && stats.total > 0;
  const showProgressBar = (isActuallyLive || isFinished) && !gameday.isStale;
  const showMinutesUntilStart = !gameday.isStale && gameday.minutesUntilStart !== undefined && !isActuallyLive && !isFinished;
  const showScheduledOnly = gameday.minutesUntilStart === undefined && stats.played === 0 && stats.live === 0;

  return (
    <a href={gamedayUrl} className={`${styles.gamedayCard} ${isLive ? styles.cardLive : ''}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <div className={styles.cardTop}>
        <div className={styles.cardHeader}>
          {isLive && (
            isActuallyLive ? (
              <span className={styles.liveBadge}>● LIVE</span>
            ) : isFinished ? (
              <span className={styles.liveBadge}>● {t('ui:gameProgress.card.finishedBadge')}</span>
            ) : (
              <span className={styles.upcomingBadgeToday}>● {t('ui:gameProgress.card.upcomingBadge')}</span>
            )
          )}
          {gameday.isStale && (
            <span className={`${styles.timeUntil} ${styles.stale}`}>{t('ui:gameProgress.card.stale')}</span>
          )}
          {showMinutesUntilStart && (
            <span className={styles.timeUntil}>
              {t('ui:gameProgress.card.minutesUntil', { minutes: gameday.minutesUntilStart })}
            </span>
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

      {showProgressBar && <ProgressBar total={stats.total} played={stats.played} live={stats.live} />}

      <div className={styles.cardStats}>
        {showScheduledOnly ? (
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
        {showProgressBar && <span className={styles.percentComplete}>{stats.percentComplete}%</span>}
      </div>
    </a>
  );
};

export default GamedayCard;
