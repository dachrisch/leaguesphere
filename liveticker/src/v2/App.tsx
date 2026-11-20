import { useEffect, useRef, useState } from "react";

import { GamedaySection } from "./components/GamedaySection";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { NoLive } from "./components/NoLive";
import { useLiveticker } from "./context/LivetickerContext";
import { groupGamesByGameday } from "./selectors";
import { selectGame, useUrlState } from "./urlState";

export default function App() {
  const {
    games,
    loading,
    error,
    toggleAllTicks,
    linkedGameMissing,
    connection,
    highlighted,
  } = useLiveticker();
  const { gameId, all } = useUrlState();
  const [now, setNow] = useState(() => new Date());
  const deepLinkGame = useRef(gameId);
  const deepLinkApplied = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  // A link with ?game= expands its game, scrolls to it and focuses the heading.
  useEffect(() => {
    const id = deepLinkGame.current;
    if (id === null || deepLinkApplied.current || loading) return;
    const detail = document.getElementById(`game-${id}`);
    if (!detail) return;
    deepLinkApplied.current = true;
    if (typeof detail.scrollIntoView === "function") {
      detail.scrollIntoView({ block: "start" });
    }
    const heading = document.getElementById(`game-heading-${id}`);
    (heading as HTMLElement).focus();
  }, [gameId, games, loading]);

  if (loading) {
    return (
      <main className="lt-app">
        <h1>Liveticker</h1>
        <p className="lt-status">Lade Liveticker …</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="lt-app">
        <h1>Liveticker</h1>
        <p className="lt-status lt-error" role="alert">
          {error}
        </p>
      </main>
    );
  }

  const groups = groupGamesByGameday(games);

  return (
    <main className="lt-app">
      <h1 className="lt-sr">Liveticker</h1>
      <ConnectionStatus status={connection} />
      {linkedGameMissing && (
        <p className="lt-status lt-notice" role="status">
          Spiel nicht mehr im Ticker
        </p>
      )}
      {groups.length === 0 ? (
        <NoLive next={null} now={now} />
      ) : (
        groups.map((group) => (
          <GamedaySection
            key={group.gameday.id}
            group={group}
            now={now}
            selectedId={gameId}
            all={all}
            onSelect={selectGame}
            onToggleAll={toggleAllTicks}
            highlighted={highlighted}
          />
        ))
      )}
    </main>
  );
}
