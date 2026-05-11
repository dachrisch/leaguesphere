import React from 'react';
import styles from '../styles.module.css';

interface PulseDotProps {
  className?: string;
}

const PulseDot: React.FC<PulseDotProps> = ({ className = '' }) => {
  const combinedClassName = `${styles.pulseDot}${className ? ` ${className}` : ''}`;
  return <div className={combinedClassName} />;
};

export default PulseDot;
