import { useEffect, useState } from 'react';

import { fetchSeasons } from '../lib/api';
import type { WidgetConfig } from '../lib/params';
import { resolveSeasonId } from '../lib/table';

/**
 * Resolve the season for the widget from either the explicit `season` id or a
 * human-readable `year` (matched against `/api/seasons/` names). Returns the
 * id, or null when neither is set / resolvable.
 */
export function useResolvedSeason(config: WidgetConfig): number | null {
  const [seasons, setSeasons] = useState<{ id: number; name: string }[]>([]);
  const needsYear = config.season === null && config.year !== null;

  useEffect(() => {
    if (!needsYear) {
      return;
    }
    let active = true;
    fetchSeasons()
      .then((data) => {
        if (active) {
          setSeasons(data);
        }
      })
      .catch(() => {
        /* year is best-effort; without seasons it falls back to all */
      });
    return () => {
      active = false;
    };
  }, [needsYear]);

  return resolveSeasonId(seasons, config.season, config.year);
}
