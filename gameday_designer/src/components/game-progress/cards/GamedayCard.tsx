import React from 'react';
import type { GamedayProgress } from '../../../types/progressTypes';
import GameRow from './GameRow';
import styles from '../styles.module.css';

interface GamedayCardProps {
  gameday: GamedayProgress;
  variant?: 'live' | 'today' | 'upcoming';
}

const GamedayCard: React.FC<GamedayCardProps> = ({ gameday, variant = 'upcoming' }) => {
  const live = gameday.games.filter((g) => g.status === 'Gestartet').length;
  const finished = gameday.games.filter((g) => g.status === 'beendet').length;
  const scheduled = gameday.games.filter((g) => g.status === 'Geplant').length;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h3>{gameday.name}</h3>
          <small>{gameday.date}</small>
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.85rem', color: '#6c757d' }}>
          <div>{gameday.season_display}</div>
          <div>{gameday.league_display}</div>
        </div>
      </div>

      {variant === 'live' && (
        <div style={{ padding: '0.5rem 1rem', background: '#fff3cd', borderBottom: '1px solid #e9ecef' }}>
          <strong style={{ color: '#856404' }}>
            ⚡ {live} game{live !== 1 ? 's' : ''} live
          </strong>
        </div>
      )}

      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
        {gameday.games.map((game) => (
          <GameRow key={game.id} game={game} />
        ))}
      </div>

      <div className={styles.cardBody}>
        <span>
          Live: <strong>{live}</strong>
        </span>
        <span>
          Finished: <strong>{finished}</strong>
        </span>
        <span>
          Scheduled: <strong>{scheduled}</strong>
        </span>
      </div>
    </div>
  );
};

export default GamedayCard;
