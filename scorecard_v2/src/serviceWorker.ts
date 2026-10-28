const SERVICE_WORKER_URL = "/scorecard/v2/sw.js";
const APP_SCOPE = "/scorecard/v2/";
// vite.config.ts `server.port`. The dev server serves the SPA at "/" and has
// no worker at /scorecard/v2/sw.js, so registering there only logs a warning.
const VITE_DEV_PORT = "3004";

/**
 * Whether the worker can be registered on this page.
 *
 * Exported for tests: the worker only makes sense when the page itself is the
 * Django-rendered app at /scorecard/v2/, never on the Vite dev server.
 */
export function shouldRegisterServiceWorker(
  location: Pick<Location, "pathname" | "port">,
): boolean {
  if (location.port === VITE_DEV_PORT) {
    return false;
  }
  return (
    location.pathname === APP_SCOPE.replace(/\/$/, "") ||
    location.pathname.startsWith(APP_SCOPE)
  );
}

/**
 * Register the offline shell worker.
 *
 * Best effort: the app works without it (it only adds the offline boot and the
 * static cache), so a failure is a console warning rather than something the
 * official has to deal with on the sideline.
 */
/**
 * Reload the page once when an updated worker takes control.
 *
 * `sw.js` calls `skipWaiting()` and `clients.claim()`, so a new build takes
 * over immediately — but the *page* keeps executing the bundle it loaded.
 * Without this, a deploy leaves the open app on the old bundle: its requests
 * still hit the server, which no longer matches the data it cached, and the
 * operator sees stale games and 404s until a manual reload.
 *
 * A page that had no controller (the first visit) is left alone: reloading
 * there would be a pointless flash on install. The reload happens at most once
 * even if several updates land.
 *
 * Exported for tests.
 */
export function reloadOnUpdate(
  container: Pick<ServiceWorkerContainer, "addEventListener">,
  hadController: boolean,
  reload: () => void,
): void {
  if (!hadController) {
    return;
  }
  let reloaded = false;
  container.addEventListener("controllerchange", () => {
    if (reloaded) {
      return;
    }
    reloaded = true;
    reload();
  });
}

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  if (!shouldRegisterServiceWorker(window.location)) {
    return;
  }

  reloadOnUpdate(
    navigator.serviceWorker,
    navigator.serviceWorker.controller !== null,
    () => window.location.reload(),
  );

  navigator.serviceWorker.register(SERVICE_WORKER_URL).catch((error: unknown) => {
    console.warn("Scorecard v2: service worker registration failed", error);
  });
}
