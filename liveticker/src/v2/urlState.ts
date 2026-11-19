import { useSyncExternalStore } from "react";

export interface UrlState {
  league: string;
  gameday: string;
  gameId: number | null;
  all: boolean;
}

function parse(search: string): UrlState {
  const params = new URLSearchParams(search);
  const rawGame = params.get("game");
  const gameId =
    rawGame !== null && /^\d+$/.test(rawGame) ? Number(rawGame) : null;
  return {
    league: params.get("league") ?? "",
    gameday: params.get("gameday") ?? "",
    gameId,
    all: params.get("all") === "1",
  };
}

let cachedSearch: string | null = null;
let cachedState: UrlState = {
  league: "",
  gameday: "",
  gameId: null,
  all: false,
};

/** The current URL state, re-parsed only when the query string changed. */
export function readUrlState(): UrlState {
  const search = typeof window === "undefined" ? "" : window.location.search;
  if (search !== cachedSearch) {
    cachedSearch = search;
    cachedState = parse(search);
  }
  return cachedState;
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

function push(mutate: (url: URL) => void): void {
  const url = new URL(window.location.href);
  mutate(url);
  window.history.pushState({}, "", url.toString());
  notify();
}

/** Select the expanded game, or clear it with ``null``. */
export function selectGame(gameId: number | null, all = false): void {
  push((url) => {
    if (gameId === null) {
      url.searchParams.delete("game");
    } else {
      url.searchParams.set("game", String(gameId));
    }
    if (all) {
      url.searchParams.set("all", "1");
    } else {
      url.searchParams.delete("all");
    }
  });
}

/** Open or close the full event history of one game. */
export function toggleAll(gameId: number): void {
  const state = readUrlState();
  const open = state.gameId === gameId && state.all;
  selectGame(gameId, !open);
}

export function useUrlState(): UrlState {
  return useSyncExternalStore(subscribe, readUrlState, readUrlState);
}
