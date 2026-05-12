import React, { useState, useEffect } from 'react';
import { Journey, JourneyEvent } from '../types';
import { fetchEvents, fetchJourneys } from '../utils/api';
import './UserTimeline.css';

export const UserTimeline: React.FC = () => {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [selectedJourneyId, setSelectedJourneyId] = useState<number | null>(null);
  const [events, setEvents] = useState<JourneyEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Load journeys on mount
  useEffect(() => {
    const loadJourneys = async () => {
      try {
        const data = await fetchJourneys();
        setJourneys(data);
      } catch (err) {
        console.error('Failed to load journeys:', err);
      }
    };
    loadJourneys();
  }, []);

  // Load events when selection changes
  useEffect(() => {
    const loadEvents = async () => {
      try {
        setLoading(true);
        const data = await fetchEvents(selectedJourneyId || undefined);
        setEvents(data);
      } catch (err) {
        console.error('Failed to load events:', err);
      } finally {
        setLoading(false);
      }
    };
    loadEvents();
  }, [selectedJourneyId]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'active';
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr || 'unknown';
    }
  };

  return (
    <div className="user-timeline">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>Event Feed</h3>
        <select
          value={selectedJourneyId || ''}
          onChange={(e) => setSelectedJourneyId(e.target.value ? Number(e.target.value) : null)}
          className="form-select"
          style={{ width: 'auto', minWidth: '300px' }}
        >
          <option value="">All Sessions (Global Feed)</option>
          {journeys.map((j) => (
            <option key={j.id} value={j.id}>
              Session {j.id}: {formatDate(j.started_at)}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: '16px' }}>
        {loading ? (
          <div>Loading events...</div>
        ) : events.length === 0 ? (
          <p>No events recorded for this selection</p>
        ) : (
          <div style={{ borderLeft: '3px solid #0d6efd', paddingLeft: '1rem' }}>
            {events.map((event) => (
              <div key={event.id} style={{ marginBottom: '1.25rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f8f9fa' }}>
                <div style={{ fontWeight: 'bold', color: '#0d6efd' }}>
                  {event.event_name}
                </div>
                <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                  {new Date(event.created_at).toLocaleString()}
                </div>
                {Object.keys(event.metadata).length > 0 && (
                  <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {JSON.stringify(event.metadata)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
