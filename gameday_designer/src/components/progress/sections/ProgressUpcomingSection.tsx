import React from 'react';
import { useTypedTranslation } from '../../../i18n/useTypedTranslation';
import type { GamedaySummary } from '../../../types/progress';
import ProgressGameRow from '../cards/ProgressGameRow';
import styles from '../styles.module.css';

interface Props {
  soon: GamedaySummary[];
  today: GamedaySummary[];
}

const ProgressUpcomingSection: React.FC<Props> = ({ soon, today }) => {
  const { t } = useTypedTranslation(['ui']);
  const all = [...soon, ...today];

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>
          {t('ui:progress.section.later_today', 'SENARE HEUTE')} · {all.length}{' '}
          {t('ui:progress.section.gamedays', 'Spieltage')}
        </span>
        <div className={styles.sectionDivider}></div>
      </div>

      <div className={styles.gameRowsContainer}>
        {all.map((gameday, idx) => (
          <ProgressGameRow key={gameday.gd.id} gameday={gameday} isLast={idx === all.length - 1} />
        ))}
      </div>
    </div>
  );
};

export default ProgressUpcomingSection;
