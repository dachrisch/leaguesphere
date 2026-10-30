/**
 * The flow: gamedays → games → preparation → tracking → finalise → result.
 *
 * One page, six states, no router. The state machine lives in ./app/state.ts;
 * this file owns the fetches (with the offline preload as fallback), the
 * loading/error panels and the header chrome. The sync lifecycle starts once,
 * here, so a queued write is drained even when the official never reopens the
 * game.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import type { Game, GameLog, Gameday } from "./api/types";
import { loadTeamLogos, type TeamLogos } from "./api/teams";
import { CurrentUserProvider, useCurrentUser } from "./app/currentUser";
import { TeamLogosProvider } from "./app/teamLogos";
import {
  dropGameSnapshots,
  loadGamedays,
  loadGames,
  loadGamesMeta,
  loadLog,
  loadLogMeta,
  loadUser,
  markGameFinished,
  messageOf,
  type CurrentUser,
} from "./app/load";
import {
  flowReducer,
  initialFlowState,
} from "./app/state";
import Screen from "./components/Screen";
import { formatGamedayDate } from "./screens/GamedayList";
import GameList from "./screens/GameList";
import GamedayList from "./screens/GamedayList";
import GameSetupScreen from "./screens/GameSetup";
import FinalizeScreen from "./screens/Finalize";
import ResultScreen from "./screens/Result";
import TrackingScreen from "./screens/Tracking";
import { logout } from "./session/logout";
import { getRuntime } from "./session/runtime";
import { useSyncStatus } from "./session/useSyncStatus";

type Loadable<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

interface FlowPanelProps {
  title: string;
  sub?: string;
  onBack?: () => void;
  onLogout: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/** The loading/error panel every fetch has: same shell, one explanation. */
function FlowPanel({
  title,
  sub,
  onBack,
  onLogout,
  loading = false,
  error = null,
  onRetry,
}: FlowPanelProps) {
  return (
    <Screen
      onBack={onBack}
      onLogout={onLogout}
      sub={sub}
      title={title}
    >
      <div className="empty-state" role={error === null ? "status" : "alert"}>
        <h2 className="empty-title">
          {loading ? "Einen Moment …" : "Das hat nicht geklappt"}
        </h2>
        <p className="empty-text">
          {error ??
            "Die Daten werden geladen. Das dauert nur einen Augenblick."}
        </p>
        {error !== null && onRetry !== undefined ? (
          <button className="setlink" onClick={onRetry} type="button">
            Erneut laden
          </button>
        ) : null}
      </div>
    </Screen>
  );
}

function initialAllGames(): boolean {
  try {
    return new URLSearchParams(globalThis.location.search).get("team") === "*";
  } catch {
    return false;
  }
}

export default function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [logos, setLogos] = useState<TeamLogos>(() => new Map());
  const loadedUser = useRef(false);

  useEffect(() => {
    // StrictMode mounts twice in development; one `/accounts/auth/user/` is
    // enough, and the header only needs it for the avatar.
    if (loadedUser.current) {
      return;
    }
    loadedUser.current = true;
    void loadUser()
      .then(setUser)
      .catch(() => {
        // Without a user the games list falls back to `*` (the whole gameday)
        // and, offline, to the snapshot of this gameday.
        setUser(null);
      });
    // The team directory is loaded once for the whole tab; offline or rejected
    // it answers with the cached map or an empty one, so screens keep their
    // initials and no error reaches the user.
    void loadTeamLogos().then(setLogos);
  }, []);

  return (
    <CurrentUserProvider user={user}>
      <TeamLogosProvider logos={logos}>
        <Flow />
      </TeamLogosProvider>
    </CurrentUserProvider>
  );
}

/**
 * The flow itself. It reads the user from the context instead of a prop: only
 * the games filter and the header avatar need it, and the header sits four
 * levels below on every screen.
 */
function Flow() {
  const user = useCurrentUser();
  const [state, dispatch] = useReducer(flowReducer, initialFlowState);
  const [gamedays, setGamedays] = useState<Loadable<Gameday[]>>({
    status: "loading",
  });
  const [allGames, setAllGames] = useState(initialAllGames);
  const [games, setGames] = useState<Loadable<Game[]>>({ status: "loading" });
  /** The crew's own list was empty and the whole gameday is shown instead. */
  const [gamesFallback, setGamesFallback] = useState(false);
  /** Age of the shown games list when it came from the snapshot (offline). */
  const [gamesStaleSince, setGamesStaleSince] = useState<number | null>(null);
  /** Age of the shown log when it came from the snapshot (offline). */
  const [logStaleSince, setLogStaleSince] = useState<number | null>(null);
  /** Bumped by "Erneut laden": the games effect refetches. */
  const [reloadGames, setReloadGames] = useState(0);
  // A running game's log is fetched before the tracking screen can open; the
  // panel below the game list shows that fetch.
  const [logRequest, setLogRequest] = useState<
    { status: "loading" } | { status: "error"; message: string } | null
  >(null);
  const resumeTarget = useRef<Game | null>(null);

  const booted = useRef(false);

  const loadGamedayList = useCallback(async (): Promise<void> => {
    setGamedays({ status: "loading" });
    try {
      const list = await loadGamedays();
      setGamedays({ status: "ready", data: list });
    } catch (error) {
      setGamedays({
        status: "error",
        message: messageOf(
          error,
          "Die Spieltage konnten nicht geladen werden. Bitte erneut versuchen.",
        ),
      });
    }
  }, []);

  useEffect(() => {
    // StrictMode mounts twice in development; the runtime and the first load
    // must only happen once.
    if (booted.current) {
      return;
    }
    booted.current = true;
    // One sync lifecycle for the tab: it registers the online listener and
    // drains what a previous session left in the outbox.
    getRuntime().start();
    void loadGamedayList();
  }, [loadGamedayList]);

  const gamedayId = state.gameday?.id ?? null;
  const team = allGames ? "*" : user?.username?.trim() || "*";

  useEffect(() => {
    if (state.phase !== "games" || gamedayId === null) {
      return;
    }
    let active = true;
    const load = async (): Promise<{
      list: Game[];
      updatedAt: number | null;
      fallback: boolean;
    }> => {
      const mine = await loadGamesMeta(gamedayId, team);
      if (team === "*" || mine.value.length > 0) {
        return { list: mine.value, updatedAt: mine.updatedAt, fallback: false };
      }
      // Nothing assigned to this official: show the whole gameday instead of
      // a dead end (the old app's empty state read "no schedule yet").
      const all = await loadGamesMeta(gamedayId, "*");
      return { list: all.value, updatedAt: all.updatedAt, fallback: true };
    };
    void load().then(
      ({ list, updatedAt, fallback }) => {
        if (active) {
          setGamesStaleSince(updatedAt);
          setGamesFallback(fallback);
          setGames({ status: "ready", data: list });
        }
      },
      (error: unknown) => {
        if (active) {
          setGames({
            status: "error",
            message: messageOf(
              error,
              "Die Spiele konnten nicht geladen werden. Bitte erneut versuchen.",
            ),
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [state.phase, gamedayId, team, reloadGames]);

  // The finalise guard reads the durable queue, not a state snapshot.
  const syncStatus = useSyncStatus(
    state.phase === "finalize" ? (state.game?.id ?? null) : null,
  );

  const toggleAll = (): void => {
    setGames({ status: "loading" });
    setAllGames((current) => {
      const next = !current;
      try {
        const url = new URL(globalThis.location.href);
        if (next) {
          url.searchParams.set("team", "*");
        } else {
          url.searchParams.delete("team");
        }
        globalThis.history.replaceState(null, "", url.toString());
      } catch {
        // A browser that refuses history still toggles the view.
      }
      return next;
    });
  };

  const resumeGame = async (game: Game): Promise<void> => {
    resumeTarget.current = game;
    setLogRequest({ status: "loading" });
    try {
      const { value: log, updatedAt } = await loadLogMeta(game.id);
      setLogRequest(null);
      setLogStaleSince(updatedAt);
      dispatch({ type: "tracking", game, log });
    } catch (error) {
      setLogRequest({
        status: "error",
        message: messageOf(
          error,
          "Der Spielverlauf konnte nicht geladen werden. Bitte erneut versuchen.",
        ),
      });
    }
  };

  /**
   * Refresh the games snapshot after the start wrote a new status. Best effort:
   * the server just answered the start, and the next games load refreshes it
   * anyway. What matters is that a reload while offline already sees the game
   * as running, not as `Geplant`.
   */
  const refreshGamesSnapshot = (): void => {
    if (state.gameday === null) {
      return;
    }
    void loadGames(state.gameday.id, team).catch(() => undefined);
  };

  const handleBack = (): void => {
    if (state.phase === "games") {
      dispatch({ type: "gamedays" });
      return;
    }
    if (state.phase === "finalize" && state.game !== null) {
      // "Spielstand bearbeiten": reopen tracking from the *server* log, not
      // from the optimistic one the finalise screen showed — those queued
      // rows must stay replayable (and undoable) instead of becoming base
      // data of a new session.
      const game = state.game;
      void loadLogMeta(game.id)
        .then(({ value: fresh, updatedAt }) => {
          setLogStaleSince(updatedAt);
          dispatch({ type: "tracking", game, log: fresh });
        })
        .catch(() => dispatch({ type: "back" }));
      return;
    }
    if (state.phase === "setup" || state.phase === "tracking") {
      // The list has to refetch: a game may have started or ended in between.
      setGames({ status: "loading" });
    }
    dispatch({ type: "back" });
  };

  const doLogout = (): void => {
    void logout();
  };

  /**
   * A finalise `409` after another device finished the game: re-read the row
   * and, when it really is `beendet`, show its result instead of an error.
   */
  const resolveFinalizeConflict = async (): Promise<GameLog | null> => {
    const game = state.game;
    const gameday = state.gameday;
    if (game === null || gameday === null) {
      return null;
    }
    try {
      const freshGames = await loadGames(gameday.id, team);
      const fresh = freshGames.find((entry) => entry.id === game.id);
      if (
        fresh === undefined ||
        fresh.status.trim().toLowerCase() !== "beendet"
      ) {
        return null;
      }
      return await loadLog(game.id);
    } catch {
      return null;
    }
  };

  if (state.phase === "gamedays") {
    if (gamedays.status === "loading") {
      return (
        <FlowPanel
          loading
          onLogout={doLogout}
          title="Meine Spieltage"
        />
      );
    }
    if (gamedays.status === "error") {
      return (
        <FlowPanel
          error={gamedays.message}
          onLogout={doLogout}
          onRetry={() => void loadGamedayList()}
          title="Meine Spieltage"
        />
      );
    }
    return (
      <GamedayList
        gamedays={gamedays.data}
        onLogout={doLogout}
        onSelect={(gameday) => {
          setGames({ status: "loading" });
          dispatch({ type: "games", gameday });
        }}
      />
    );
  }

  if (state.gameday === null) {
    // Defensive: a state edit that lost the gameday must not crash the app.
    return (
      <FlowPanel
        error="Der Spieltag ist nicht mehr geladen."
        onLogout={doLogout}
        onRetry={() => dispatch({ type: "gamedays" })}
        title="Meine Spieltage"
      />
    );
  }

  const gameday = state.gameday;

  if (state.phase === "games") {
    if (logRequest !== null) {
      return (
        <FlowPanel
          error={
            logRequest.status === "error" ? logRequest.message : undefined
          }
          loading={logRequest.status === "loading"}
          onBack={() => {
            setLogRequest(null);
            resumeTarget.current = null;
          }}
          onLogout={doLogout}
          onRetry={() => {
            const target = resumeTarget.current;
            if (target !== null) {
              void resumeGame(target);
            }
          }}
          title="Spiel wird geöffnet"
        />
      );
    }
    if (games.status === "loading" || games.status === "error") {
      return (
        <FlowPanel
          error={games.status === "error" ? games.message : undefined}
          loading={games.status === "loading"}
          onBack={handleBack}
          onLogout={doLogout}
          onRetry={() => {
            setGames({ status: "loading" });
            setReloadGames((current) => current + 1);
          }}
          title={gameday.name}
        />
      );
    }
    const subtitle = [
      formatGamedayDate(gameday.date),
      `${gameday.start} Uhr`,
      gameday.address.trim(),
    ]
      .filter((part) => part !== "")
      .join(" · ");
    return (
      <GameList
        allGames={allGames || gamesFallback}
        fallback={gamesFallback}
        games={games.data}
        onBack={handleBack}
        onLogout={doLogout}
        onResume={(game) => void resumeGame(game)}
        onSelect={(game) => dispatch({ type: "setup", game })}
        onToggleAll={toggleAll}
        staleSince={gamesStaleSince}
        subtitle={subtitle}
        title={gameday.name}
      />
    );
  }

  if (state.game === null) {
    return (
      <FlowPanel
        error="Das Spiel ist nicht mehr geladen."
        onBack={handleBack}
        onLogout={doLogout}
        onRetry={() => dispatch({ type: "back" })}
        title="Spiele"
      />
    );
  }

  const game = state.game;

  if (state.phase === "setup") {
    return (
      <GameSetupScreen
        game={game}
        onBack={handleBack}
        onLogout={doLogout}
        onStarted={(startedLog) => {
          // The start answered with a fresh log; it is not stored data.
          setLogStaleSince(null);
          dispatch({ type: "tracking", game, log: startedLog });
          refreshGamesSnapshot();
        }}
      />
    );
  }

  if (state.log === null) {
    return (
      <FlowPanel
        error="Der Spielverlauf ist nicht mehr geladen."
        onBack={handleBack}
        onLogout={doLogout}
        onRetry={() => dispatch({ type: "back" })}
        title="Spiel läuft"
      />
    );
  }

  const log = state.log;

  if (state.phase === "tracking") {
    return (
      <TrackingScreen
        game={game}
        gamedayName={gameday.name}
        initialLog={log}
        leagueLabel={gameday.league_display}
        onBack={handleBack}
        onFinalize={(current) => dispatch({ type: "finalize", log: current })}
        onLogout={doLogout}
        staleSince={logStaleSince}
      />
    );
  }

  if (state.phase === "finalize") {
    return (
      <FinalizeScreen
        failedWrites={syncStatus.failed}
        game={game}
        log={log}
        onBack={handleBack}
        onFinalizeConflict={resolveFinalizeConflict}
        onFinalized={(finished) => {
          // The result is the server's; from now on this game is finished. The
          // games snapshot is updated and the per-game log/setup preload is
          // dropped, so an offline boot shows "beendet" instead of reopening a
          // closed game and writing to it.
          setGamesStaleSince(null);
          void markGameFinished(gameday.id, game.id);
          void dropGameSnapshots(game.id);
          dispatch({ type: "result", log: finished });
        }}
        onLogout={doLogout}
        pendingWrites={syncStatus.pending}
      />
    );
  }

  return (
    <ResultScreen
      game={game}
      log={log}
      onDone={() => {
        setGames({ status: "loading" });
        dispatch({ type: "back" });
      }}
      onLogout={doLogout}
    />
  );
}
