import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConnectionStatus } from "./components/ConnectionStatus";
import { GamedaySection } from "./components/GamedaySection";
import { NoLive } from "./components/NoLive";
import { useLiveticker } from "./context/LivetickerContext";
import { groupGamesByGameday, selectAutoGame } from "./selectors";
import { replaceGame, useUrlState } from "./urlState";

export default function App() {
  const {
    games,
    loading,
    error,
    selectGame,
    toggleAllTicks,
    linkedGameMissing,
    connection,
    highlighted,
    all,
  } = useLiveticker();
  const { gameId, gameday } = useUrlState();
  const [now, setNow] = useState(() => new Date());
  // Auto-selection (first live / last result) is active until the user picks
  // something. It drives both the URL and the visible detail panel.
  const [autoSelection, setAutoSelection] = useState(gameId === null);
  const deepLinkGame = useRef(gameId);
  const deepLinkApplied = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  // A link with a game path expands its game, scrolls to it and focuses the
  // heading. Auto-selection must not scroll: the page just loaded.
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

  const groups = groupGamesByGameday(games);

  // What the page shows without an explicit selection: the first live game,
  // or the newest result once the day is over. On the bare root this only
  // applies when exactly one gameday is on screen; otherwise the root view is
  // "all of today" and one game must not replace it in the address bar.
  const autoTarget = useMemo(() => {
    if (loading || error) return null;
    const grouped = groupGamesByGameday(games);
    const group =
      gameday !== null
        ? grouped.find((candidate) => candidate.gameday.id === gameday)
        : grouped.length === 1
          ? grouped[0]
          : null;
    if (!group) return null;
    const game = selectAutoGame(group.games);
    return game ? { gameday: group.gameday.id, gameId: game.gameId } : null;
  }, [error, games, gameday, loading]);
  const autoGamedayId = autoTarget?.gameday ?? null;
  const autoGameId = autoTarget?.gameId ?? null;

  // The URL follows the auto-selection, but only while the user has not made
  // a choice: an auto-replaced game is ours, a user's selection is not.
  const userSelected = useRef(gameId !== null);
  const autoGame = useRef<number | null>(null);
  useEffect(() => {
    if (autoGamedayId === null || autoGameId === null) return;
    if (userSelected.current) return;
    if (gameId !== null && gameId !== autoGame.current) return;
    if (gameId === autoGameId) {
      autoGame.current = autoGameId;
      return;
    }
    autoGame.current = autoGameId;
    // replaceState, not pushState: the back button must not walk through the
    // games the ticker picked by itself.
    replaceGame(autoGamedayId, autoGameId);
  }, [autoGamedayId, autoGameId, gameId]);

  // Back/forward is an explicit navigation too: do not immediately rewrite
  // the entry the user just navigated to.
  useEffect(() => {
    const onPopState = () => {
      userSelected.current = true;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const selectGameExplicit = useCallback(
    (gamedayId: number, id: number | null) => {
      userSelected.current = true;
      setAutoSelection(false);
      selectGame(gamedayId, id);
    },
    [selectGame],
  );

  const toggleAllExplicit = useCallback(
    (id: number) => {
      userSelected.current = true;
      setAutoSelection(false);
      toggleAllTicks(id);
    },
    [toggleAllTicks],
  );

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
            autoSelect={autoSelection}
            onSelect={selectGameExplicit}
            onToggleAll={toggleAllExplicit}
            highlighted={highlighted}
          />
        ))
      )}
    </main>
  );
}
