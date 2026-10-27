/**
 * Logout on a shared device.
 *
 * v2 authenticates with the Django session cookie, so the server logout is a
 * `POST /logout/` (Django 5+ rejects the GET). Before the navigation every
 * local trace of the official goes: the outbox, the preloaded snapshots and
 * the worker's runtime caches. The precache stays, so the next official can
 * still boot the shell without a network.
 *
 * The queue is deliberately *not* flushed first: an official handing the
 * device over is not a promise that the queued writes belong to the next
 * user's session, and a half-sent game is worse than a re-entry.
 */
import { getRuntime } from "./runtime";

export const LOGOUT_PATH = "/logout/";
const CSRF_COOKIE = "csrftoken";

function readCsrfToken(): string | null {
  for (const cookie of document.cookie.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator === -1) {
      continue;
    }
    if (cookie.slice(0, separator).trim() === CSRF_COOKIE) {
      const value = cookie.slice(separator + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}

/** Drop the queue, the preload and the worker's per-session static cache. */
export async function clearLocalData(): Promise<void> {
  const runtime = getRuntime();
  try {
    await runtime.outbox.clearAll();
  } catch {
    // IndexedDB may be unavailable; the navigation still ends the session.
  }
  try {
    await runtime.snapshots.clearAll();
  } catch {
    // Same.
  }
  try {
    globalThis.navigator?.serviceWorker?.controller?.postMessage({
      type: "logout",
    });
  } catch {
    // No worker (dev server, unsupported browser): nothing to clear there.
  }
}

/**
 * Clear the device, end the server session, then leave the app.
 *
 * A failed POST (offline) still clears the device and goes to the Django
 * logout page rather than pretending the session is gone. `navigate` is
 * injectable so the test does not have to let jsdom navigate.
 */
export async function logout(
  navigate: (url: string) => void = (url) => globalThis.location.assign(url),
): Promise<void> {
  await clearLocalData();

  const token = readCsrfToken();
  const body = new URLSearchParams();
  if (token !== null) {
    body.set("csrfmiddlewaretoken", token);
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (token !== null) {
    headers["X-CSRFToken"] = token;
  }

  try {
    await fetch(LOGOUT_PATH, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body,
    });
    navigate("/");
  } catch {
    navigate(LOGOUT_PATH);
  }
}
