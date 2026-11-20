import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { fetchGames } from "../api";
import type { Game, Tick } from "../types";
import { toggleAll, useUrlState } from "../urlState";
import {
  useLivetickerStream,
  type StreamStatus,
} from "./useLivetickerStream";

interface LivetickerValue {
  games: Game[];
  loading: boolean;
  error: string | null;
  allTicksFor: number[];
  toggleAllTicks: (gameId: number) => void;
  linkedGameMissing: boolean;
  /** How fresh the displayed data is (stream vs. polling fallback). */
  connection: StreamStatus;
  /** ``"<gameId>:<tick identity>"`` keys that just arrived. */
  highlighted: ReadonlySet<string>;
}

const LivetickerContext = createContext<LivetickerValue | null>(null);

/** Identifies a tick inside one game; the API has no tick id. */
export function tickIdentity(tick: Tick): string {
  return `${tick.time}|${tick.type}|${tick.team ?? ""}|${tick.text}`;
}

/** The template hands the feature switch over as a data attribute. */
export function streamEnabledFromDom(): boolean {
  if (typeof document === "undefined") return false;
  const element = document.getElementById("liveticker-v2-app");
  return element?.dataset.streamEnabled === "true";
}

interface LivetickerProviderProps {
  children: ReactNode;
  initialGames?: Game[];
  /** Defaults to the template's ``data-stream-enabled`` attribute. */
  streamEnabled?: boolean;
}

const HIGHLIGHT_MS = 3_000;

export function LivetickerProvider({
  children,
  initialGames,
  streamEnabled = streamEnabledFromDom(),
}: LivetickerProviderProps) {
  const { league, gameday, gameId, all } = useUrlState();
  const [games, setGames] = useState<Game[]>(initialGames ?? []);
  const [loading, setLoading] = useState(initialGames === undefined);
  const [error, setError] = useState<string | null>(null);
  // A linked game that is not part of the filtered payload is asked for once
  // more through the existing getAllTicksFor parameter.
  const [retryTicksFor, setRetryTicksFor] = useState<number[]>([]);
  const retriedGame = useRef<number | null>(null);

  const seenTicks = useRef(new Map<number, Set<string>>());
  const highlightTimer = useRef<number | undefined>(undefined);
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(new Set());

  const allTicksFor = useMemo(() => {
    if (!all || gameId === null) return retryTicksFor;
    if (retryTicksFor.includes(gameId)) return retryTicksFor;
    return [...retryTicksFor, gameId];
  }, [all, gameId, retryTicksFor]);

  /** Install a payload (stream snapshot or poll result) and mark new ticks. */
  const applyGames = useCallback((next: Game[]) => {
    const fresh = new Set<string>();
    next.forEach((game) => {
      const previous = seenTicks.current.get(game.gameId);
      const current = new Set<string>();
      game.ticks.forEach((tick) => {
        const key = tickIdentity(tick);
        current.add(key);
        if (previous && !previous.has(key)) {
          fresh.add(`${game.gameId}:${key}`);
        }
      });
      seenTicks.current.set(game.gameId, current);
    });

    setGames(next);
    setError(null);
    setLoading(false);

    if (fresh.size > 0) {
      setHighlighted(fresh);
      if (highlightTimer.current !== undefined) {
        window.clearTimeout(highlightTimer.current);
      }
      highlightTimer.current = window.setTimeout(() => {
        setHighlighted(new Set());
      }, HIGHLIGHT_MS);
    }
  }, []);

  useEffect(
    () => () => {
      if (highlightTimer.current !== undefined) {
        window.clearTimeout(highlightTimer.current);
      }
    },
    [],
  );

  const connection = useLivetickerStream({
    enabled: streamEnabled && initialGames === undefined,
    league,
    gameday,
    allTicksFor,
    onSnapshot: applyGames,
  });

  // Polling owns loading/refresh whenever the stream is off or has given up.
  // While the stream is connecting or live it does nothing, so a live page
  // does not quietly double-fetch every 60 s.
  useEffect(() => {
    if (initialGames !== undefined) return;
    if (streamEnabled && connection !== "polling") return;
    let active = true;
    let controller: AbortController | null = null;

    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const next = await fetchGames(
          league,
          gameday,
          controller.signal,
          allTicksFor,
        );
        if (active) {
          applyGames(next);
        }
      } catch (reason) {
        if (
          active &&
          !(reason instanceof DOMException && reason.name === "AbortError")
        ) {
          setError("Der Liveticker konnte nicht geladen werden.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
      controller?.abort();
    };
  }, [allTicksFor, applyGames, connection, gameday, initialGames, league, streamEnabled]);

  useEffect(() => {
    if (initialGames !== undefined || loading || error || gameId === null) {
      return;
    }
    if (games.some((game) => game.gameId === gameId)) return;
    if (retriedGame.current === gameId) return;
    retriedGame.current = gameId;
    setRetryTicksFor((current) => [...current, gameId]);
  }, [error, gameId, games, initialGames, loading]);

  const toggleAllTicks = (id: number) => toggleAll(id);
  const linkedGameMissing =
    gameId !== null && !loading && !error && !games.some((game) => game.gameId === gameId);

  const value = useMemo(
    () => ({
      games,
      loading,
      error,
      allTicksFor,
      toggleAllTicks,
      linkedGameMissing,
      connection,
      highlighted,
    }),
    [
      allTicksFor,
      connection,
      error,
      games,
      highlighted,
      linkedGameMissing,
      loading,
    ],
  );
  return (
    <LivetickerContext.Provider value={value}>
      {children}
    </LivetickerContext.Provider>
  );
}

export function useLiveticker(): LivetickerValue {
  const value = useContext(LivetickerContext);
  if (value === null) {
    throw new Error("useLiveticker() needs a LivetickerProvider");
  }
  return value;
}
