import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { fetchGames } from "../api";
import type { Game } from "../types";

interface LivetickerValue {
  games: Game[];
  loading: boolean;
  error: string | null;
  allTicksFor: number[];
  toggleAllTicks: (gameId: number) => void;
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
  const { league, gameday } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      league: params.get("league") ?? "",
      gameday: params.get("gameday") ?? "",
    };
  }, []);
  const [games, setGames] = useState<Game[]>(initialGames ?? []);
  const [loading, setLoading] = useState(initialGames === undefined);
  const [error, setError] = useState<string | null>(null);
  const [allTicksFor, setAllTicksFor] = useState<number[]>([]);

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

  const toggleAllTicks = (gameId: number) => {
    setAllTicksFor((current) =>
      current.includes(gameId)
        ? current.filter((id) => id !== gameId)
        : [...current, gameId],
    );
  };

  const value = useMemo(
    () => ({ games, loading, error, allTicksFor, toggleAllTicks }),
    [allTicksFor, error, games, loading],
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
