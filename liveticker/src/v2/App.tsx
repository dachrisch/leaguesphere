import { useEffect, useState } from "react";

import { ContextHeader } from "./components/ContextHeader";
import { EventList } from "./components/EventList";
import { LiveStrip } from "./components/LiveStrip";
import { NoLive } from "./components/NoLive";
import { ShareButton } from "./components/ShareButton";
import { Scoreboard } from "./components/Scoreboard";
import { useLiveticker } from "./context/LivetickerContext";
import { selectFinishedGame, selectLiveGames } from "./selectors";

export default function App() {
  const { games, loading, error } = useLiveticker();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());
  const liveGames = selectLiveGames(games);
  const finishedGame = selectFinishedGame(games);
  const selected =
    liveGames.find((game) => game.gameId === selectedId) ?? liveGames[0] ?? null;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <main className="lt-app">
        <p className="lt-status">Lade Liveticker …</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="lt-app">
        <p className="lt-status lt-error" role="alert">
          {error}
        </p>
      </main>
    );
  }

  if (selected) {
    return (
      <main className="lt-app">
        {liveGames.length > 1 && (
          <LiveStrip
            games={liveGames}
            selectedId={selected.gameId}
            onSelect={setSelectedId}
          />
        )}
        <ContextHeader game={selected} />
        <Scoreboard game={selected} />
        <EventList game={selected} />
        <ShareButton />
      </main>
    );
  }

  if (finishedGame) {
    return (
      <main className="lt-app">
        <ContextHeader game={finishedGame} />
        <Scoreboard game={finishedGame} />
        <EventList game={finishedGame} />
        <ShareButton />
      </main>
    );
  }

  return (
    <main className="lt-app">
      <NoLive games={games} now={now} />
      <ShareButton />
    </main>
  );
}
