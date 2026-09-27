import { useEffect, useState } from 'react';

import { fetchLiveticker } from '@/lib/api';
import type { LiveGame } from '@/lib/types';

const POLL_INTERVAL_MS = 60_000;

export function useLiveticker(enabled: boolean): LiveGame[] {
  const [games, setGames] = useState<LiveGame[]>([]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let active = true;
    const poll = () => {
      fetchLiveticker()
        .then((data) => {
          if (active) {
            setGames(data);
          }
        })
        .catch(() => {
          /* transient - keep the last known scores */
        });
    };
    poll();
    const handle = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(handle);
    };
  }, [enabled]);

  return games;
}
