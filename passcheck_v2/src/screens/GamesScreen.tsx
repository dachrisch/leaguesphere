import { useEffect, useState } from "react";

import { fetchGames } from "../api/passcheck";
import type { GamesResponse } from "../api/types";
import AppHeader from "../components/AppHeader";
import GameCard from "../components/GameCard";
import StatusChip from "../components/StatusChip";

type Props = {
  onOpen: (teamId: number, gamedayId: number) => void;
  loadGames?: (gamedayId?: number) => Promise<GamesResponse>;
  gamedayId?: number;
  pendingCount?: number;
  onLogout?: () => void;
};

type State =
  | { status: "loading" }
  | { status: "ready"; data: GamesResponse }
  | { status: "error"; message: string };

function GamesScreen({
  onOpen,
  loadGames = fetchGames,
  gamedayId,
  pendingCount = 0,
  onLogout,
}: Props) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadGames(gamedayId)
      .then((data) => {
        if (!cancelled) {
          setState({ status: "ready", data });
        }
      })
      .catch((error: { message?: string }) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: error?.message ?? "Spiele konnten nicht geladen werden.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadGames, gamedayId]);

  return (
    <section className="games-screen">
      <AppHeader
        kicker="Passcheck v2"
        title="Meine Spiele"
        sub={state.status === "ready" ? state.data.officialsTeamName : undefined}
        badge={<StatusChip pending={pendingCount} />}
        onLogout={onLogout}
      />

      <div className="games-body">
        {state.status === "loading" && <p>loading...</p>}

        {state.status === "error" && <p role="alert">{state.message}</p>}

        {state.status === "ready" && (
          <>
            {state.data.games.length === 0 ? (
              <p>Heute keine Spiele für den Passcheck.</p>
            ) : (
              state.data.games.map((game, index) => (
                <GameCard
                  key={`${game.gameday_id}-${game.field}-${index}`}
                  game={game}
                  onOpen={onOpen}
                />
              ))
            )}
          </>
        )}
      </div>

      <footer className="games-foot">
        <a href="/passcheck/">Zur klassischen Ansicht</a>
      </footer>
    </section>
  );
}

export default GamesScreen;
