import { useCallback, useEffect, useState } from 'react';

export interface TourSeenState {
  seen: boolean;
  loading: boolean;
  markSeen: () => void;
}

interface JourneyEventDto {
  id: number;
  event_name: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useTourSeen(tourId: string): TourSeenState {
  const [seen, setSeen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const eventNames = [`gd_tour_${tourId}_completed`, `gd_tour_${tourId}_skipped`].join(',');

    fetch(`/api/journey/events/?event_name__in=${eventNames}`, { credentials: 'include' })
      .then((res) => (res.ok ? (res.json() as Promise<JourneyEventDto[]>) : []))
      .then((events) => {
        if (!cancelled) setSeen(events.length > 0);
      })
      .catch(() => {
        if (!cancelled) setSeen(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tourId]);

  const markSeen = useCallback(() => setSeen(true), []);

  return { seen, loading, markSeen };
}
