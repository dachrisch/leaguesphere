import { useEffect, useState } from 'react';

import { fetchSnapshot } from '../lib/api';
import type { Snapshot } from '../lib/types';

export interface SnapshotState {
  snapshot: Snapshot | null;
  loading: boolean;
  error: string | null;
}

export function useSnapshot(teamIds: number[]): SnapshotState {
  const key = teamIds.join(',');
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
    let active = true;
    const load = async () => {
      try {
        const snapshot = await fetchSnapshot(ids);
        if (active) {
          setState({ snapshot, loading: false, error: null });
        }
      } catch {
        if (active) {
          setState({
            snapshot: null,
            loading: false,
            error: 'Daten konnten nicht geladen werden.',
          });
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [key]);

  return state;
}
