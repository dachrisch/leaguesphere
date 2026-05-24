import React from 'react';
import styles from './styles.module.css';

interface ProgressBarProps {
  total: number;
  played: number;
  live: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ total, played, live }) => {
  const isFinished = played === total && total > 0;
  const playedPercentage = total > 0 ? (played / total) * 100 : 0;
  const livePercentage = total > 0 ? (live / total) * 100 : 0;
  const pendingPercentage = total > 0 ? ((total - played - live) / total) * 100 : 0;

  const playedColor = isFinished ? '#28a745' : '#6c757d';

  return (
    <div className={styles.progressBar}>
      {/* Played games (gray or green if finished) */}
      {playedPercentage > 0 && (
        <div
          className={styles.progressSegment}
          style={{
            width: `${playedPercentage}%`,
            backgroundColor: playedColor,
          }}
        />
      )}
      {/* Live games (green) */}
      {livePercentage > 0 && (
        <div
          className={styles.progressSegment}
          style={{
            width: `${livePercentage}%`,
            backgroundColor: '#28a745',
          }}
        />
      )}
      {/* Pending games (light gray) */}
      {pendingPercentage > 0 && (
        <div
          className={styles.progressSegment}
          style={{
            width: `${pendingPercentage}%`,
            backgroundColor: '#e9ecef',
          }}
        />
      )}
    </div>
  );
};

export default ProgressBar;
