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

  useEffect(() => {
    if (initialGames !== undefined) return;
    let active = true;
    let controller: AbortController | null = null;

    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const next = await fetchGames(league, gameday, controller.signal);
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
  }, [gameday, initialGames, league]);

  const value = useMemo(
    () => ({ games, loading, error }),
    [error, games, loading],
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
