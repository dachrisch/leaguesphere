import React from 'react';
import { useTypedTranslation } from '../../../i18n/useTypedTranslation';
import type { GamedayProgress } from '../../../api/gameProgressApi';
import type { GamedaySummary } from '../../../types/progress';
import ProgressSegmentBar from './ProgressSegmentBar';
import styles from '../styles.module.css';

interface ProgressGameDayCardProps {
  gameday: GamedayProgress;
  summary: GamedaySummary['s'];
}

const ProgressGameDayCard: React.FC<ProgressGameDayCardProps> = ({ gameday, summary }) => {
  const { t, i18n } = useTypedTranslation(['ui']);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    const options: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: '2-digit',
    };
    return date.toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'de-DE', options);
  };

  return (
    <div className={styles.gameDayCard}>
      <div className={styles.gameDayCardHeader}>
        <div className={styles.gameDayCardTitle}>{gameday.name}</div>
        <div className={styles.gameDayCardSubtitle}>
          {formatDate(gameday.date)} · {gameday.league_display}
        </div>
      </div>

      {/* Segment bars for each game */}
      <div className={styles.segmentBarContainer}>
        {gameday.games.map((game) => (
          <ProgressSegmentBar key={game.id} status={game.status} />
        ))}
      </div>

      {/* Game stats summary */}
      {gameday.games.length > 0 && (
        <div className={styles.gameDayCardStats}>
          <span className={styles.statsBadge}>
            {summary.played} {t('ui:progress.card.played', 'beendet')}
          </span>
          <span className={styles.statsBadge}>
            {summary.live} {t('ui:progress.card.live', 'im Spiel')}
          </span>
          <span className={styles.statsBadge}>
            {summary.upcoming} {t('ui:progress.card.upcoming', 'geplant')}
          </span>
        </div>
      )}
    </div>
  );
};

export default ProgressGameDayCard;
