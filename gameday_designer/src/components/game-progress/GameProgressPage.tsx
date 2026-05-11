import React from 'react';
import { useGameProgress } from './hooks/useGameProgress';
import LiveSection from './sections/LiveSection';
import TodaySection from './sections/TodaySection';
import UpcomingSection from './sections/UpcomingSection';
import styles from './styles.module.css';

const GameProgressPage: React.FC = () => {
  const state = useGameProgress();

  if (state.loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading game progress...</div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          Error loading games: {state.error.message}
        </div>
      </div>
    );
  }

  if (state.gamedays.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>No games scheduled</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {state.live.length > 0 && <LiveSection gamedays={state.live} />}
        {state.today.length > 0 && <TodaySection gamedays={state.today} />}
        {(state.soon.length > 0 || state.upcoming.length > 0) && (
          <UpcomingSection soon={state.soon} upcoming={state.upcoming} />
        )}
        {state.recent.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Recent</h2>
            <div className={styles.gamedayList}>
              {state.recent.map((gameday) => (
                <GamedayCardPreview key={gameday.id} gameday={gameday} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

// Simple card preview for recent gamedays
const GamedayCardPreview: React.FC<{ gameday: any }> = ({ gameday }) => {
  const finished = gameday.games.filter((g: any) => g.status === 'beendet').length;
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3>{gameday.name}</h3>
        <small>{gameday.date}</small>
      </div>
      <div className={styles.cardBody}>
        <span>{gameday.league_display}</span>
        <span>Finished: {finished}/{gameday.games.length}</span>
      </div>
    </div>
  );
};

export default GameProgressPage;
