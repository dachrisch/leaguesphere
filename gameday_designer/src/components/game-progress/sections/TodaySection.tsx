import React from 'react';
import type { GamedayProgress } from '../../../types/progressTypes';
import GamedayCard from '../cards/GamedayCard';
import styles from '../styles.module.css';

interface TodaySectionProps {
  gamedays: GamedayProgress[];
}

const TodaySection: React.FC<TodaySectionProps> = ({ gamedays }) => {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>📅 Today</h2>
      <div className={styles.gamedayList}>
        {gamedays.map((gameday) => (
          <GamedayCard key={gameday.id} gameday={gameday} variant="today" />
        ))}
      </div>
    </section>
  );
};

export default TodaySection;
