import { useEffect, useState } from 'react';

import { fetchSnapshot, retryDelayMs, type SnapshotFilters } from '../lib/api';
import type { Snapshot } from '../lib/types';

export interface SnapshotState {
  snapshot: Snapshot | null;
  loading: boolean;
  error: string | null;
}

export interface SnapshotPolling {
  /** Re-fetch interval; revalidation makes unchanged polls cheap 304s. */
  intervalMs: number;
  /**
   * Keep polling only while this holds (e.g. a watched game is live). Pass a
   * stable function (module scope): a new one per render restarts the fetch.
   */
  shouldPoll: (snapshot: Snapshot) => boolean;
}

export function useSnapshot(
  teamIds: number[],
  filters: SnapshotFilters = {},
  polling: SnapshotPolling | null = null
): SnapshotState {
  const key = teamIds.join(',');
  const filtersKey = JSON.stringify(filters);
  const intervalMs = polling?.intervalMs ?? null;
  const shouldPoll = polling?.shouldPoll ?? null;
  const [state, setState] = useState<SnapshotState>({
    snapshot: null,
    loading: teamIds.length > 0,
    error: null,
  });

  useEffect(() => {
    const ids = key === '' ? [] : key.split(',').map(Number);
    if (ids.length === 0) {
      return;
    }
    const scope = JSON.parse(filtersKey) as SnapshotFilters;
    let active = true;
    let pollHandle: number | undefined;
    let last: Snapshot | null = null;

    const schedulePoll = (snapshot: Snapshot) => {
      if (intervalMs === null || shouldPoll === null || !shouldPoll(snapshot)) {
        return;
      }
      pollHandle = window.setTimeout(() => {
        if (document.hidden) {
          // Nobody is looking: check again later instead of fetching.
          schedulePoll(snapshot);
          return;
        }
        load();
      }, intervalMs);
    };

    const load = async () => {
      // One retry on 429 (honouring Retry-After), then surface the error.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const snapshot = await fetchSnapshot(ids, scope);
          if (active) {
            last = snapshot;
            setState({ snapshot, loading: false, error: null });
            schedulePoll(snapshot);
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
          if (!active) {
            return;
          }
          if (last === null) {
            setState({
              snapshot: null,
              loading: false,
              error: 'Daten konnten nicht geladen werden.',
            });
          } else {
            // A failed poll keeps the last known data and tries again later.
            schedulePoll(last);
          }
          return;
        }
      }
    };
    load();
    return () => {
      active = false;
      window.clearTimeout(pollHandle);
    };
  }, [key, filtersKey, intervalMs, shouldPoll]);

  return state;
}
