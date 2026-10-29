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
 * user's session, and a half-sent game is worse than a re-entry. But the queue
 * must not vanish without a word either — a game with three unsent touchdowns
 * is exactly what the offline capture promised to keep. So the logout asks
 * first, and does nothing at all if the official does not confirm.
 */
import { getRuntime } from "./runtime";

export const LOGOUT_PATH = "/logout/";
const CSRF_COOKIE = "csrftoken";

/** What the device would lose: waits that have not reached the server. */
export interface QueuedWrites {
  pending: number;
  failed: number;
}

/** The question the official has to answer before unsent writes are dropped. */
export function logoutWarning(count: number): string {
  return count === 1
    ? "1 Eintrag ist noch nicht übertragen. Trotzdem abmelden?"
    : `${count} Einträge sind noch nicht übertragen. Trotzdem abmelden?`;
}

/**
 * Count the queued writes of every game. A failing store reads as "nothing
 * queued": without a queue there is nothing to protect, and the logout must
 * not become impossible because IndexedDB is broken.
 */
export async function queuedWrites(): Promise<QueuedWrites> {
  const outbox = getRuntime().outbox;
  try {
    const gameIds = await outbox.gameIds();
    let pending = 0;
    let failed = 0;
    for (const gameId of gameIds) {
      const [waiting, rejected] = await Promise.all([
        outbox.pending(gameId),
        outbox.failed(gameId),
      ]);
      pending += waiting.length;
      failed += rejected.length;
    }
    return { pending, failed };
  } catch {
    return { pending: 0, failed: 0 };
  }
}

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
 * Queued writes block the logout until the official confirms: the device would
 * otherwise drop events the game needs. `confirm` and `navigate` are
 * injectable so the test does not have to answer a real dialog or navigate.
 *
 * A failed POST (offline) still clears the device and goes to the Django
 * logout page rather than pretending the session is gone.
 */
export async function logout(
  navigate: (url: string) => void = (url) => globalThis.location.assign(url),
  confirm: (question: string) => boolean = (question) =>
    typeof globalThis.confirm === "function"
      ? globalThis.confirm(question)
      : true,
): Promise<void> {
  const queued = await queuedWrites();
  const unsent = queued.pending + queued.failed;
  if (unsent > 0 && !confirm(logoutWarning(unsent))) {
    return;
  }

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
