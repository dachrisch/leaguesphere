import { useEffect, useState } from 'react';

import { fetchSnapshot, retryDelayMs, type SnapshotFilters } from '../lib/api';
import type { Snapshot } from '../lib/types';

export interface SnapshotState {
  snapshot: Snapshot | null;
  loading: boolean;
  error: string | null;
}

export function useSnapshot(
  teamIds: number[],
  filters: SnapshotFilters = {},
  ready = true
): SnapshotState {
  const key = teamIds.join(',');
  const season = filters.season ?? null;
  const league = filters.league ?? null;
  const [state, setState] = useState<SnapshotState>({
    snapshot: null,
    loading: teamIds.length > 0,
    error: null,
  });

  useEffect(() => {
    const ids = key === '' ? [] : key.split(',').map(Number);
    if (ids.length === 0 || !ready) {
      return;
    }
    let active = true;
    const load = async () => {
      // One retry on 429 (honouring Retry-After), then surface the error.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const snapshot = await fetchSnapshot(ids, {
            season: season ?? undefined,
            league: league ?? undefined,
          });
          if (active) {
            setState({ snapshot, loading: false, error: null });
          }
          return;
        } catch (error) {
          const delay = retryDelayMs(error);
          if (delay !== null && attempt === 0) {
            await new Promise((resolve) => window.setTimeout(resolve, delay));
            if (!active) {
              return;
            }
            continue;
          }
          if (active) {
            setState({
              snapshot: null,
              loading: false,
              error: 'Daten konnten nicht geladen werden.',
            });
          }
          return;
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [key, season, league, ready]);

  return state;
}
