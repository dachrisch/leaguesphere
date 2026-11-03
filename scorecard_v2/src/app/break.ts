/**
 * The half-time break countdown.
 *
 * The app runs no game clock (the official clock is authoritative), but the
 * officials do need to know when the break is over. The countdown therefore
 * starts when the half-time is recorded and is remembered per game: a phone
 * that reloads mid-break shows the remaining time instead of starting over.
 *
 * It lives in `localStorage`, not in the outbox: a break is not a game event
 * and nothing about it is written to the server.
 */

/** The break between the halves, in seconds. */
export const HALFTIME_BREAK_SECONDS = 5 * 60;

const PREFIX = "scorecard:v2:break:";

function key(gameId: number): string {
  return `${PREFIX}${gameId}`;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // A browser that refuses storage (private mode, a locked-down webview)
    // only loses the reload persistence; the current break still runs.
    return null;
  }
}

/** When the break of this game started (epoch ms), or `null`. */
export function readBreakStart(gameId: number): number | null {
  const raw = storage()?.getItem(key(gameId));
  if (raw === null || raw === undefined || raw.trim() === "") {
    return null;
  }
  const startedAt = Number(raw);
  return Number.isFinite(startedAt) ? startedAt : null;
}

/** Remember that the break of this game started at {@link startedAt}. */
export function rememberBreakStart(
  gameId: number,
  startedAt: number = Date.now(),
): number {
  storage()?.setItem(key(gameId), String(startedAt));
  return startedAt;
}

/** Forget the break (skipped, expired or left). */
export function forgetBreak(gameId: number): void {
  storage()?.removeItem(key(gameId));
}

/** Seconds left of the break, clamped to `0..HALFTIME_BREAK_SECONDS`. */
export function secondsLeft(
  startedAt: number,
  now: number = Date.now(),
): number {
  const elapsed = Math.floor((now - startedAt) / 1000);
  return Math.min(
    HALFTIME_BREAK_SECONDS,
    Math.max(0, HALFTIME_BREAK_SECONDS - elapsed),
  );
}

/** `mm:ss` (the break never reaches an hour). */
export function formatBreak(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
