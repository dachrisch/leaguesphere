import { useEffect, useState } from 'react';

import { fetchSeasons } from '../lib/api';
import type { WidgetConfig } from '../lib/params';
import { resolveSeasonId } from '../lib/table';

export interface ResolvedSeason {
  seasonId: number | null;
  /** False while a `year` is still being resolved against `/api/seasons/`. */
  ready: boolean;
}

/**
 * Resolve the season for the widget from either the explicit `season` id or a
 * human-readable `year` (matched against `/api/seasons/` names). Returns the
 * id, or null when neither is set / resolvable. `ready` tells the caller to
 * hold off fetching the snapshot until the year has resolved, so a `year=`
 * widget does not fetch the all-seasons snapshot first and the season one
 * second.
 */
export function useResolvedSeason(config: WidgetConfig): ResolvedSeason {
  const needsYear = config.season === null && config.year !== null;
  const [seasons, setSeasons] = useState<{ id: number; name: string }[]>([]);
  const [resolvedYear, setResolvedYear] = useState<string | null>(null);

  useEffect(() => {
    if (!needsYear || config.year === null) {
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
      })
      .finally(() => {
        if (active) {
          setResolvedYear(config.year);
        }
      });
    return () => {
      active = false;
    };
  }, [needsYear, config.year]);

  return {
    seasonId: resolveSeasonId(seasons, config.season, config.year),
    ready: !needsYear || resolvedYear === config.year,
  };
}
