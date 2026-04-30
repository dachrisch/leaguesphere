import React, { useState, useEffect } from 'react';
import { Journey, JourneyEvent } from '../types';
import { fetchJourneys, fetchEvents } from '../utils/api';

export const UserTimeline: React.FC = () => {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [selectedJourneyId, setSelectedJourneyId] = useState<number | null>(null);
  const [events, setEvents] = useState<JourneyEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadJourneys = async () => {
      try {
        setLoading(true);
        const data = await fetchJourneys();
        setJourneys(data);
        if (data.length > 0) {
          setSelectedJourneyId(data[0].id);
        }
      } catch (err) {
        console.error('Failed to load journeys:', err);
      } finally {
        setLoading(false);
      }
    };
    loadJourneys();
  }, []);

  useEffect(() => {
    if (selectedJourneyId) {
      const loadEvents = async () => {
        try {
          const data = await fetchEvents(selectedJourneyId);
          setEvents(data);
        } catch (err) {
          console.error('Failed to load events:', err);
        }
      };
      loadEvents();
    }
  }, [selectedJourneyId]);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="user-timeline">
      <h3>Journey Timeline</h3>
      <select
        value={selectedJourneyId || ''}
        onChange={(e) => setSelectedJourneyId(Number(e.target.value))}
      >
        {journeys.map((j) => (
          <option key={j.id} value={j.id}>
            {j.started_at} to {j.ended_at || 'active'}
          </option>
        ))}
      </select>

      <div style={{ marginTop: '16px' }}>
        {events.length === 0 ? (
          <p>No events in this journey</p>
        ) : (
          <div style={{ borderLeft: '2px solid #1a73e8', paddingLeft: '16px' }}>
            {events.map((event) => (
              <div key={event.id} style={{ marginBottom: '16px', paddingBottom: '8px' }}>
                <div style={{ fontWeight: 'bold', color: '#1a73e8' }}>
                  {event.event_name}
                </div>
                <div style={{ fontSize: '12px', color: '#888' }}>
                  {new Date(event.created_at).toLocaleString()}
                </div>
                {Object.keys(event.metadata).length > 0 && (
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
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
