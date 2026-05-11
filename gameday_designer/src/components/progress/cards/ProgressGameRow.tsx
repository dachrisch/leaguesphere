import React, { useState, useEffect } from 'react';
import { useTypedTranslation } from '../../../i18n/useTypedTranslation';
import type { GamedaySummary } from '../../../types/progress';
import styles from '../styles.module.css';

interface ProgressGameRowProps {
  gameday: GamedaySummary;
  isLast: boolean;
}

const ProgressGameRow: React.FC<ProgressGameRowProps> = ({ gameday, isLast }) => {
  const { t, i18n } = useTypedTranslation(['ui']);
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    const calculateCountdown = () => {
      const now = new Date();
      const kickoff = gameday.s.firstStart;

      if (!(kickoff instanceof Date)) {
        return;
      }

      const diff = kickoff.getTime() - now.getTime();
      const minutes = Math.floor(diff / 60000);

      if (minutes > 0 && minutes <= 90) {
        setCountdown(`${t('ui:progress.time.in', 'in')} ${minutes}m`);
      } else {
        setCountdown(null);
      }
    };

    calculateCountdown();

    const interval = setInterval(calculateCountdown, 30000);
    return () => clearInterval(interval);
  }, [gameday.s.firstStart, t]);

  const formatDate = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = {
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

  const rowClassName = isLast ? `${styles.gameRow} ${styles.gameRowLast}` : styles.gameRow;

  return (
    <div className={rowClassName}>
      <div className={styles.gameRowInfo}>
        <div className={styles.gameRowTitle}>{gameday.gd.name}</div>
        <div className={styles.gameRowTime}>
          {formatDate(gameday.s.firstStart)} · {formatTime(gameday.s.firstStart)}
        </div>
        {countdown && <div className={styles.gameRowCountdown}>{countdown}</div>}
      </div>
    </div>
  );
};

export default ProgressGameRow;
