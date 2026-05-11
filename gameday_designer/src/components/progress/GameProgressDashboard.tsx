/**
 * GameProgressDashboard Component
 *
 * Main container for game progress dashboard.
 * Displays:
 * - Hero strip with live count + stats
 * - LIVE section (2-col grid of game day cards)
 * - SPÄTER HEUTE (upcoming within 30min or today)
 * - AUSBLICK & RÜCKBLICK (footer columns: next 7 days + 24h review)
 */

import React from 'react';
import { useTypedTranslation } from '../../i18n/useTypedTranslation';
import { useGameProgress } from './hooks/useGameProgress';
import ProgressLiveSection from './sections/ProgressLiveSection';
import ProgressUpcomingSection from './sections/ProgressUpcomingSection';
import ProgressOutlookReviewFooter from './sections/ProgressOutlookReviewFooter';
import styles from './styles.module.css';

/**
 * Main dashboard component
 */
const GameProgressDashboard: React.FC = () => {
  const { t } = useTypedTranslation(['ui']);

  const { loading, error, live, soon, today, upcomingWeek, recent, nextScheduled, liveGameCount, todayGameDayCount } =
    useGameProgress();

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.heroStripSkeleton}></div>
        <div className={styles.cardGridSkeleton}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={styles.cardSkeleton}></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <i className="bi bi-exclamation-triangle"></i>
          <h2>{t('ui:progress.error.title', 'Failed to load gamedays')}</h2>
          <p>{error.message}</p>
          <button onClick={() => window.location.reload()}>
            {t('ui:progress.error.retry', 'Retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.contentScroll}>
        {/* LIVE section with promoted header */}
        {live.length > 0 && (
          <ProgressLiveSection
            gamedays={live}
            liveGameCount={liveGameCount}
            upcomingCount={soon.length + today.length}
            recentCount={recent.length}
            todayGameDayCount={todayGameDayCount}
          />
        )}

        {/* SPÄTER HEUTE section */}
        {(soon.length > 0 || today.length > 0) && (
          <ProgressUpcomingSection soon={soon} today={today} />
        )}

        {/* AUSBLICK & RÜCKBLICK footer columns */}
        <ProgressOutlookReviewFooter
          upcoming={upcomingWeek}
          recent={recent}
          nextScheduled={nextScheduled}
        />
      </div>
    </div>
  );
};

export default GameProgressDashboard;
