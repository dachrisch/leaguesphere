/**
 * ProgressLiveSection Component
 *
 * Shows live gamedays in 2-column grid with per-game progress bars.
 * When used as main header, displays compact stats alongside live info.
 */

import React from 'react';
import { useTypedTranslation } from '../../../i18n/useTypedTranslation';
import type { GamedaySummary } from '../../../types/progress';
import ProgressGameDayCard from '../cards/ProgressGameDayCard';
import styles from '../styles.module.css';

interface ProgressLiveSectionProps {
  gamedays: GamedaySummary[];
  liveGameCount?: number;
  upcomingCount?: number;
  recentCount?: number;
  todayGameDayCount?: number;
}

const ProgressLiveSection: React.FC<ProgressLiveSectionProps> = ({
  gamedays,
  liveGameCount,
  upcomingCount,
  recentCount,
  todayGameDayCount,
}) => {
  const { t, i18n } = useTypedTranslation(['ui']);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(i18n.language === 'en' ? 'en-GB' : 'de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.pulseDotSmall}></div>
        <span className={styles.sectionLabel}>
          {t('ui:progress.section.live', 'LIVE')} · {gamedays.length}{' '}
          {t('ui:progress.section.gamedays', 'Spieltage')}
        </span>
        <div className={styles.sectionDivider}></div>
      </div>

      <div className={styles.cardGrid}>
        {gamedays.map(({ gd, s }) => (
          <ProgressGameDayCard key={gd.id} gameday={gd} summary={s} />
        ))}
      </div>
    </div>
  );
};

export default ProgressLiveSection;
