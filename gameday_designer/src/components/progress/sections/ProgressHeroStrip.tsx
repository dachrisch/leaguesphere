/**
 * ProgressHeroStrip Component
 *
 * Hero section showing:
 * - Large live count with pulsing indicator
 * - Stats: live games, games today, completed 24h
 * - Today's date and scheduled gameday count
 */

import React from 'react';
import { useTypedTranslation } from '../../../i18n/useTypedTranslation';
import styles from '../styles.module.css';

interface ProgressHeroStripProps {
  liveCount: number;
  liveGameCount: number;
  upcomingCount: number;
  recentCount: number;
  todayGameDayCount: number;
}

const ProgressHeroStrip: React.FC<ProgressHeroStripProps> = ({
  liveCount,
  liveGameCount,
  upcomingCount,
  recentCount,
  todayGameDayCount,
}) => {
  const { t, i18n } = useTypedTranslation(['ui']);
  const now = new Date();

  const formatDate = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    };
    return date.toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'de-DE', options);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(i18n.language === 'en' ? 'en-GB' : 'de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={styles.heroStrip}>
      {/* Live count with pulsing dot */}
      <div className={styles.heroLiveSection}>
        <div className={styles.liveCountContainer}>
          <div className={styles.liveCount}>{liveCount}</div>
          {liveCount > 0 && <div className={styles.pulseDot}></div>}
        </div>
        <div>
          <div className={styles.heroLabel}>
            {t('ui:progress.hero.live', 'live')} · {formatTime(now)}
          </div>
          <div className={styles.heroTitle}>
            {liveCount === 1
              ? t('ui:progress.hero.gameday_singular', 'Spieltag läuft gerade')
              : t('ui:progress.hero.gameday_plural', 'Spieltage laufen gerade')}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className={styles.heroDivider}></div>

      {/* Stats */}
      <div className={styles.heroStats}>
        <div className={styles.statBox}>
          <div className={styles.statNumber}>{liveGameCount}</div>
          <div className={styles.statLabel}>
            {t('ui:progress.hero.games_in_play', 'Spiele\nim Spiel')}
          </div>
        </div>
        <div className={styles.statBox}>
          <div className={styles.statNumber}>{upcomingCount}</div>
          <div className={styles.statLabel}>
            {t('ui:progress.hero.games_today', 'noch heute')}
          </div>
        </div>
        <div className={styles.statBox}>
          <div className={styles.statNumber}>{recentCount}</div>
          <div className={styles.statLabel}>
            {t('ui:progress.hero.completed_24h', 'beendet\n(24 h)')}
          </div>
        </div>
      </div>

      {/* Today info */}
      <div style={{ flex: 1 }}></div>
      <div className={styles.heroToday}>
        <div className={styles.todayLabel}>
          {t('ui:progress.hero.today', 'HEUTE')}
        </div>
        <div className={styles.todayDate}>{formatDate(now)}</div>
        <div className={styles.todayCount}>
          {todayGameDayCount} {t('ui:progress.hero.scheduled', 'Spieltage geplant')}
        </div>
      </div>
    </div>
  );
};

export default ProgressHeroStrip;
