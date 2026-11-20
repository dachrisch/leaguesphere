import { useSyncExternalStore } from "react";

/**
 * The ticker's path state. Query parameters are deliberately absent: the
 * scorecard addresses a game the same way, and a shared URL must survive
 * without filters. ``all`` (full event history) is UI state in the context,
 * not part of the address.
 */
export interface UrlState {
  gameday: number | null;
  gameId: number | null;
}

const ROOT_PATH = /^\/liveticker\/v2\/?$/;
const GAMEDAY_PATH = /^\/liveticker\/v2\/gameday\/(\d+)\/?$/;
const GAME_PATH = /^\/liveticker\/v2\/gameday\/(\d+)\/game\/(\d+)\/?$/;

function parse(pathname: string): UrlState {
  if (ROOT_PATH.test(pathname)) {
    return { gameday: null, gameId: null };
  }
  const gameday = GAMEDAY_PATH.exec(pathname);
  if (gameday) {
    return { gameday: Number(gameday[1]), gameId: null };
  }
  const game = GAME_PATH.exec(pathname);
  if (game) {
    return { gameday: Number(game[1]), gameId: Number(game[2]) };
  }
  return { gameday: null, gameId: null };
}

let cachedPath: string | null = null;
let cachedState: UrlState = { gameday: null, gameId: null };

/** The current URL state, re-parsed only when the path changed. */
export function readUrlState(): UrlState {
  const pathname = window.location.pathname;
  if (pathname !== cachedPath) {
    cachedPath = pathname;
    cachedState = parse(pathname);
  }
  return cachedState;
}

/** The canonical path for a state; the only URL shape the app writes. */
export function tickerPath(state: {
  gameday: number | null;
  gameId?: number | null;
}): string {
  if (state.gameday === null) return "/liveticker/v2/";
  if (state.gameId != null) {
    return `/liveticker/v2/gameday/${state.gameday}/game/${state.gameId}/`;
  }
  return `/liveticker/v2/gameday/${state.gameday}/`;
}

const listeners = new Set<() => void>();
let listeningForPopState = false;

function notify(): void {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!listeningForPopState) {
    window.addEventListener("popstate", notify);
    listeningForPopState = true;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && listeningForPopState) {
      window.removeEventListener("popstate", notify);
      listeningForPopState = false;
    }
  };
}

/** Keep the server-rendered canonical/OG tags in step with client navigation. */
function updateCanonical(path: string): void {
  if (typeof document === "undefined") return;
  const absolute = `${window.location.origin}${path}`;
  document
    .querySelector('link[rel="canonical"]')
    ?.setAttribute("href", absolute);
  document
    .querySelector('meta[property="og:url"]')
    ?.setAttribute("content", absolute);
}

function navigate(path: string, mode: "push" | "replace"): void {
  if (window.location.pathname === path && window.location.search === "") {
    return;
  }
  if (mode === "replace") {
    window.history.replaceState({}, "", path);
  } else {
    window.history.pushState({}, "", path);
  }
  updateCanonical(path);
  notify();
}

/** User picked a game (or cleared it with ``null``): push a new history entry. */
export function selectGame(gamedayId: number, gameId: number | null): void {
  navigate(tickerPath({ gameday: gamedayId, gameId }), "push");
}

/**
 * The app auto-selected a game: replace the current entry so Back is not
 * polluted with intermediate automatic selections.
 */
export function replaceGame(gamedayId: number, gameId: number): void {
  navigate(tickerPath({ gameday: gamedayId, gameId }), "replace");
}

export function useUrlState(): UrlState {
  return useSyncExternalStore(subscribe, readUrlState, readUrlState);
}
