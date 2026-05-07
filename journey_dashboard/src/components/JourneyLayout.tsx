import React, { ReactNode } from 'react';
import JourneyHeader from './JourneyHeader';
import '../styles/JourneyLayout.css';

interface JourneyLayoutProps {
  children: ReactNode;
}

/**
 * Main layout component for Journey Dashboard.
 * Provides header and content area with proper spacing.
 */
const JourneyLayout: React.FC<JourneyLayoutProps> = ({ children }) => {
  return (
    <div className="journey-layout d-flex flex-column h-100 overflow-hidden">
      <JourneyHeader />
      <main className="journey-content flex-grow-1 overflow-auto">
        {children}
      </main>
    </div>
  );
};

export default JourneyLayout;
