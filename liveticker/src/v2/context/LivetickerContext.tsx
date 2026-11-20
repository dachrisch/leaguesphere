import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { fetchGames } from "../api";
import type { Game } from "../types";
import { toggleAll, useUrlState } from "../urlState";

interface LivetickerValue {
  games: Game[];
  loading: boolean;
  error: string | null;
  allTicksFor: number[];
  toggleAllTicks: (gameId: number) => void;
  linkedGameMissing: boolean;
}

const LivetickerContext = createContext<LivetickerValue | null>(null);

interface LivetickerProviderProps {
  children: ReactNode;
  initialGames?: Game[];
}

export function LivetickerProvider({
  children,
  initialGames,
}: LivetickerProviderProps) {
  const { league, gameday, gameId, all } = useUrlState();
  const [games, setGames] = useState<Game[]>(initialGames ?? []);
  const [loading, setLoading] = useState(initialGames === undefined);
  const [error, setError] = useState<string | null>(null);
  // A linked game that is not part of the filtered payload is asked for once
  // more through the existing getAllTicksFor parameter.
  const [retryTicksFor, setRetryTicksFor] = useState<number[]>([]);
  const retriedGame = useRef<number | null>(null);

  const allTicksFor = useMemo(() => {
    if (!all || gameId === null) return retryTicksFor;
    if (retryTicksFor.includes(gameId)) return retryTicksFor;
    return [...retryTicksFor, gameId];
  }, [all, gameId, retryTicksFor]);

  useEffect(() => {
    if (initialGames !== undefined) return;
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
          setGames(next);
          setError(null);
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
  }, [allTicksFor, gameday, initialGames, league]);

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
    }),
    [allTicksFor, error, games, linkedGameMissing, loading],
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
