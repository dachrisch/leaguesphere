import React from 'react';
import styles from '../styles.module.css';

interface ProgressSegmentBarProps {
  status: string;
  className?: string;
}

const ProgressSegmentBar: React.FC<ProgressSegmentBarProps> = ({ status, className = '' }) => {
  const getStatusClass = (status: string): string => {
    switch (status) {
      case 'Gestartet':
        return styles.segmentBarLive;
      case 'beendet':
        return styles.segmentBarCompleted;
      case 'Geplant':
      default:
        return styles.segmentBarPlanned;
    }
  };

  const combinedClassName = `${styles.segmentBar} ${getStatusClass(status)}${className ? ` ${className}` : ''}`;
  return <div className={combinedClassName} />;
};

export default ProgressSegmentBar;
