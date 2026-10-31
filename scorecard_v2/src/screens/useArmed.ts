import { useCallback, useEffect, useRef, useState } from "react";

/** How long a button offers its second action before it reverts. */
export const ARM_MS = 10_000;

interface Armed<K extends string> {
  armed: K | null;
  arm: (key: K) => void;
  disarm: () => void;
}

/**
 * Two-step buttons: the first tap arms a button for {@link ARM_MS}, a second
 * tap in that window runs its second action (a confirmation, the jersey of an
 * entry just saved). The button keeps its size; only its label changes. One
 * button is armed at a time — arming another replaces it and restarts the
 * window.
 */
export function useArmed<K extends string>(ms: number = ARM_MS): Armed<K> {
  const [armed, setArmed] = useState<K | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback((): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const arm = useCallback(
    (key: K): void => {
      clear();
      setArmed(key);
      timer.current = setTimeout(() => {
        timer.current = null;
        setArmed(null);
      }, ms);
    },
    [clear, ms],
  );

  const disarm = useCallback((): void => {
    clear();
    setArmed(null);
  }, [clear]);

  useEffect(() => clear, [clear]);

  return { armed, arm, disarm };
}
