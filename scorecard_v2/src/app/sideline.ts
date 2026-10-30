/**
 * Small device affordances for the sideline: the screen stays on while a game
 * is tracked, and a saved entry is confirmed with a short vibration.
 *
 * Both are enhancements only. A browser without the API (iOS Safari has no
 * vibration, older WebViews no wake lock) or one that refuses the request
 * leaves the app working exactly as before.
 */
import { useEffect } from "react";

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

interface WakeLockLike {
  request: (type: "screen") => Promise<WakeLockSentinelLike>;
}

function wakeLockApi(): WakeLockLike | undefined {
  return (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
}

/**
 * Keep the screen on while `active`. The browser drops a wake lock whenever the
 * page is hidden (another app, the lock button), so it is requested again each
 * time the page becomes visible.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const api = wakeLockApi();
    if (!active || api === undefined) {
      return;
    }
    let sentinel: WakeLockSentinelLike | null = null;
    let disposed = false;

    const acquire = (): void => {
      api
        .request("screen")
        .then((next) => {
          if (disposed) {
            void next.release().catch(() => undefined);
            return;
          }
          sentinel = next;
        })
        .catch(() => undefined);
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") {
        acquire();
      }
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}

/** A short vibration that confirms a saved entry, where the device has one. */
export function confirmTap(): void {
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(15);
    }
  } catch {
    // Some WebViews throw instead of ignoring the call.
  }
}
