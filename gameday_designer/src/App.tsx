/**
 * Gameday Designer App
 *
 * Main application component for the visual list-based editor
 * for creating flag football tournament schedules.
 *
 * This is the new list-based approach that replaces the
 * previous flowchart-based editor.
 */

import React from 'react';

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ListDesignerApp from './components/ListDesignerApp';
import GamedayDashboard from './components/dashboard/GamedayDashboard';
import GameProgressDashboard from './components/progress/GameProgressDashboard';
import MainLayout from './components/layout/MainLayout';
import { GamedayProvider } from './context/GamedayContext';

import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

/**
 * Main App component for Gameday Designer.
 */
const App: React.FC = () => {
  let basename = '/gamedays/gameday/design';
  if (import.meta.env.DEV) {
    if (window.location.pathname.startsWith('/gamedays/progress')) {
      basename = '/gamedays/progress';
    } else {
      basename = '/';
    }
  } else if (window.location.pathname.startsWith('/gamedays/progress')) {
    basename = '/gamedays/progress';
  }

  const mountEl = document.getElementById('gameday-designer');
  const currentUserId = parseInt(mountEl?.dataset.userId ?? '0', 10);

  const isProgressPage = window.location.pathname.startsWith('/gamedays/progress');

  return (
    <BrowserRouter basename={basename} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <GamedayProvider currentUserId={currentUserId}>
        <Routes>
          {isProgressPage ? (
            <Route path="/" element={<GameProgressDashboard />} />
          ) : (
            <Route path="/" element={<MainLayout />}>
              <Route index element={<GamedayDashboard />} />
              <Route path="designer/:id" element={<ListDesignerApp />} />
            </Route>
          )}
          <Route path="progress" element={<GameProgressDashboard />} />
        </Routes>
      </GamedayProvider>
    </BrowserRouter>
  );
};

export default App;