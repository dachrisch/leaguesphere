import React from 'react';
import { useTypedTranslation } from '../../../i18n/useTypedTranslation';
import type { GamedaySummary } from '../../../types/progress';
import ProgressGameRow from '../cards/ProgressGameRow';
import styles from '../styles.module.css';

interface Props {
  upcoming: GamedaySummary[];
  recent: GamedaySummary[];
  nextScheduled: GamedaySummary | null;
}

const ProgressOutlookReviewFooter: React.FC<Props> = ({
  upcoming,
  recent,
  nextScheduled,
}) => {
  const { t } = useTypedTranslation(['ui']);

  return (
    <div className={styles.footerColumns}>
      <div className={styles.outloookColumn}>
        <div className={styles.subHeader}>
          {t('ui:progress.section.outlook_subtitle', 'AUSBLICK · NÄCHSTE 7 TAGE')} ·{' '}
          {upcoming.length}
        </div>
        <div className={styles.gameRowsContainer}>
          {upcoming.map((gameday, idx) => (
            <ProgressGameRow
              key={gameday.gd.id}
              gameday={gameday}
              isLast={idx === upcoming.length - 1}
            />
          ))}
        </div>
      </div>

      <div className={styles.reviewColumn}>
        <div className={styles.subHeader}>
          {t('ui:progress.section.review_subtitle', 'RÜCKBLICK · LETZTE 24 H')} · {recent.length}
        </div>
        <div className={styles.gameRowsContainer}>
          {recent.map((gameday, idx) => (
            <ProgressGameRow
              key={gameday.gd.id}
              gameday={gameday}
              isLast={idx === recent.length - 1}
            />
          ))}
        </div>
      </div>

      {/* Next Scheduled Row */}
      {nextScheduled && (
        <div className={styles.nextScheduledRow}>
          <div className={styles.subHeader}>
            {t('ui:progress.section.next_scheduled', 'NÄCHSTER TERMIN')}
          </div>
          <ProgressGameRow gameday={nextScheduled} isLast={true} />
        </div>
      )}
    </div>
  );
};

export default ProgressOutlookReviewFooter;
