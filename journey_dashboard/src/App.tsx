import React, { useState, useEffect } from 'react';
import JourneyLayout from './components/JourneyLayout';
import { AdoptionMetrics } from './components/AdoptionMetrics';
import { TopActionsTable } from './components/TopActionsTable';
import { UserTimeline } from './components/UserTimeline';
import { fetchStats, fetchGlobalAdoption } from './utils/api';
import { StatsResponse, GlobalAdoptionResponse } from './types';
import './index.css';

function App() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [adoptionData, setAdoptionData] = useState<GlobalAdoptionResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Auth is handled by Django's LoginRequiredMixin on the server side.
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      console.log('No auth token found in localStorage, falling back to session authentication');
    }
  }, []);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [statsData, adoption] = await Promise.all([
          fetchStats(),
          fetchGlobalAdoption()
        ]);
        setStats(statsData);
        setAdoptionData(adoption);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  return (
    <JourneyLayout>
      <div className="app" style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <h1>Global Journey Dashboard</h1>
        <p style={{ color: '#666', marginBottom: '24px' }}>
          System-wide feature adoption and engagement patterns.
        </p>

        <AdoptionMetrics adoptionData={adoptionData} />
        <TopActionsTable stats={stats} loading={loading} />
        <UserTimeline />
      </div>
    </JourneyLayout>
  );
}

export default App;
