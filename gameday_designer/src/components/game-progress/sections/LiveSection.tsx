import React from 'react';
import type { GamedayProgress } from '../../../types/progressTypes';
import GamedayCard from '../cards/GamedayCard';
import styles from '../styles.module.css';

interface LiveSectionProps {
  gamedays: GamedayProgress[];
}

const LiveSection: React.FC<LiveSectionProps> = ({ gamedays }) => {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>🔴 Live Now</h2>
      <div className={styles.gamedayList}>
        {gamedays.map((gameday) => (
          <GamedayCard key={gameday.id} gameday={gameday} variant="live" />
        ))}
      </div>
    </section>
  );
};

export default LiveSection;
