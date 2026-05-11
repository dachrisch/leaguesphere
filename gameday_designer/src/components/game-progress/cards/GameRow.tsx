import React from 'react';
import type { GameInfo } from '../../../types/progressTypes';
import styles from '../styles.module.css';

interface GameRowProps {
  game: GameInfo;
}

const GameRow: React.FC<GameRowProps> = ({ game }) => {
  const getStatusBadgeClass = () => {
    switch (game.status) {
      case 'Gestartet':
        return styles.statusLive;
      case 'Geplant':
        return styles.statusScheduled;
      case 'beendet':
        return styles.statusFinished;
      default:
        return '';
    }
  };

  const getStatusLabel = () => {
    switch (game.status) {
      case 'Gestartet':
        return '🔴 Live';
      case 'Geplant':
        return '⏰ Scheduled';
      case 'beendet':
        return '✓ Finished';
      default:
        return game.status;
    }
  };

  return (
    <div className={styles.gameRow}>
      <div>
        <strong>Field {game.field}</strong>
      </div>
      <div>{game.scheduled}</div>
      <div>
        <span className={`${styles.statusBadge} ${getStatusBadgeClass()}`}>
          {getStatusLabel()}
        </span>
      </div>
      <div>
        {game.gameresult ? (
          <strong>
            {game.gameresult.home_score ?? '–'} : {game.gameresult.guest_score ?? '–'}
          </strong>
        ) : (
          <span style={{ color: '#6c757d' }}>–</span>
        )}
      </div>
    </div>
  );
};

export default GameRow;
