import React from 'react';
import { useTypedTranslation } from '../../i18n/useTypedTranslation';
import { useGameProgress } from './hooks/useGameProgress';
import GamedayCard from './GamedayCard';
import styles from './styles.module.css';

const GameProgressPage: React.FC = () => {
  const { t } = useTypedTranslation(['ui']);
  const state = useGameProgress();

  if (state.loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t('ui:gameProgress.state.loading')}</div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          {t('ui:gameProgress.state.error', { message: state.error.message })}
        </div>
      </div>
    );
  }

  if (state.gamedays.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>{t('ui:gameProgress.state.empty')}</div>
      </div>
    );
  }

  const totalOutlook = state.soon.length + state.upcoming.length;

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* LIVE section */}
        {state.live.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              {t('ui:gameProgress.section.live', { count: state.totalLiveGames })}
            </h2>
            <div className={styles.gamedayList}>
              {state.live.map((gameday) => (
                <GamedayCard key={gameday.id} gameday={gameday} isLive={true} />
              ))}
            </div>
          </section>
        )}

        {/* SENARE HEUTE section (Later today) */}
        {state.today.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              {t('ui:gameProgress.section.today', { count: state.today.length } as const)}
            </h2>
            <div className={styles.gamedayList}>
              {state.today.map((gameday) => (
                <GamedayCard key={gameday.id} gameday={gameday} />
              ))}
            </div>
          </section>
        )}

        {/* AUSBLICK section (Outlook) */}
        {totalOutlook > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              {t('ui:gameProgress.section.outlook', { days: '7', count: totalOutlook })}
            </h2>
            <div className={styles.gamedayList}>
              {[...state.soon, ...state.upcoming].map((gameday) => (
                <GamedayCard key={gameday.id} gameday={gameday} />
              ))}
            </div>
          </section>
        )}

        {/* RÜCKBLICK section (Lookback) */}
        {state.recent.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              {t('ui:gameProgress.section.recent', { count: state.recent.length })}
            </h2>
            <div className={styles.gamedayList}>
              {state.recent.map((gameday) => (
                <GamedayCard key={gameday.id} gameday={gameday} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default GameProgressPage;
