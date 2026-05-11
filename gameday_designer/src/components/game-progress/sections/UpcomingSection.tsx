import React from 'react';
import type { GamedayProgress } from '../../../types/progressTypes';
import GamedayCard from '../cards/GamedayCard';
import styles from '../styles.module.css';

interface UpcomingSectionProps {
  soon: GamedayProgress[];
  upcoming: GamedayProgress[];
}

const UpcomingSection: React.FC<UpcomingSectionProps> = ({ soon, upcoming }) => {
  return (
    <>
      {soon.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>⏰ This Week</h2>
          <div className={styles.gamedayList}>
            {soon.map((gameday) => (
              <GamedayCard key={gameday.id} gameday={gameday} variant="upcoming" />
            ))}
          </div>
        </section>
      )}
      {upcoming.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>📌 Scheduled</h2>
          <div className={styles.gamedayList}>
            {upcoming.map((gameday) => (
              <GamedayCard key={gameday.id} gameday={gameday} variant="upcoming" />
            ))}
          </div>
        </section>
      )}
    </>
  );
};

export default UpcomingSection;
