import { useCallback, useState } from 'react';

/**
 * Per-user, local-only "Expert Mode" toggle for the Progression Inspector.
 *
 * Deliberately NOT backed by any API call or shared state — Expert Mode must
 * stay off by default, invisible to normal users, and never shared with
 * collaborators viewing the same gameday. `localStorage` is the right fit:
 * it's private to this browser and this origin, survives reloads, and never
 * round-trips through the designer's saved `FlowState`.
 */
const STORAGE_KEY = 'gd_expert_mode';

function readStoredExpertMode(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    // localStorage can throw (private browsing, disabled storage) — default off.
    return false;
  }
}

/**
 * Returns the current Expert Mode flag and a setter that persists it.
 */
export function useExpertMode(): [boolean, (value: boolean) => void] {
  const [expertMode, setExpertModeState] = useState<boolean>(readStoredExpertMode);

  const setExpertMode = useCallback((value: boolean) => {
    setExpertModeState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
    } catch {
      // Storage unavailable — the toggle still works for this session, it just won't persist.
    }
  }, []);

  return [expertMode, setExpertMode];
}
