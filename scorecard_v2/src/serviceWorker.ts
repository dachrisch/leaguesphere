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
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  if (!shouldRegisterServiceWorker(window.location)) {
    return;
  }

  navigator.serviceWorker.register(SERVICE_WORKER_URL).catch((error: unknown) => {
    console.warn("Scorecard v2: service worker registration failed", error);
  });
}
