import { useEffect, useState } from "react";

export function useSessionTimer(clock: () => number = Date.now) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (startedAt === null) {
      setElapsedMs(0);
      return;
    }
    setElapsedMs(clock() - startedAt);
    const interval = window.setInterval(() => {
      setElapsedMs(clock() - startedAt);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [startedAt, clock]);

  const start = () => {
    setStartedAt((previous) => previous ?? clock());
  };

  return { elapsedMs, startedAt, start };
}
