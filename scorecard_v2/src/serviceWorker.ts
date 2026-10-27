const SERVICE_WORKER_URL = "/scorecard/v2/sw.js";

/**
 * Register the offline shell worker.
 *
 * Best effort: the app works without it (it only adds the offline reload and
 * the static cache), so a failure is a console warning rather than something
 * the official has to deal with on the sideline.
 */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.register(SERVICE_WORKER_URL).catch((error: unknown) => {
    console.warn("Scorecard v2: service worker registration failed", error);
  });
}
