import React, { useState, useEffect } from 'react';
import { JourneyEvent } from '../types';
import { fetchEvents } from '../utils/api';
import './UserTimeline.css';

export const UserTimeline: React.FC = () => {
  const [events, setEvents] = useState<JourneyEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        setLoading(true);
        const data = await fetchEvents();
        setEvents(data);
      } catch (err) {
        console.error('Failed to load global events:', err);
      } finally {
        setLoading(false);
      }
    };
    loadEvents();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="user-timeline">
      <h3>Global Event Feed</h3>
      <div style={{ marginTop: '16px' }}>
        {events.length === 0 ? (
          <p>No events recorded yet</p>
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
