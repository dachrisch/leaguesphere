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

/**
 * The break between the halves, in seconds.
 *
 * IFAF 2023 R 3-2-1 says two minutes; the value lives in the sport definition
 * (`periods.intermission_minutes`) and this constant is only the fallback for
 * a device that has not fetched it. A competition may set its own - the app
 * counts what it is told instead of insisting on the book.
 */
export const HALFTIME_BREAK_SECONDS = 2 * 60;

/** The definition's intermission, or the fallback. */
export function intermissionSeconds(minutes: number | null | undefined): number {
  return typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0
    ? Math.round(minutes * 60)
    : HALFTIME_BREAK_SECONDS;
}

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
  total: number = HALFTIME_BREAK_SECONDS,
): number {
  const elapsed = Math.floor((now - startedAt) / 1000);
  return Math.min(total, Math.max(0, total - elapsed));
}

/** `mm:ss` (the break never reaches an hour). */
export function formatBreak(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
