import { useEffect, useState } from "react";

import { fetchGames } from "../api/passcheck";
import type { GamesResponse } from "../api/types";
import GameCard from "../components/GameCard";
import ThemeToggle from "../components/ThemeToggle";

type Props = {
  onOpen: (teamId: number, gamedayId: number) => void;
  loadGames?: (gamedayId?: number) => Promise<GamesResponse>;
  gamedayId?: number;
};

type State =
  | { status: "loading" }
  | { status: "ready"; data: GamesResponse }
  | { status: "error"; message: string };

function GamesScreen({ onOpen, loadGames = fetchGames, gamedayId }: Props) {
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
      <header className="passcheck-header">
        <div>
          <p className="passcheck-kicker">Passcheck v2</p>
          <h1>Meine Spiele</h1>
        </div>
        <ThemeToggle />
      </header>

      {state.status === "loading" && <p>loading...</p>}

      {state.status === "error" && <p role="alert">{state.message}</p>}

      {state.status === "ready" && (
        <>
          <p className="games-officials">{state.data.officialsTeamName}</p>
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
          <footer className="games-foot">
            <a href="/passcheck/">Zur klassischen Ansicht</a>
          </footer>
        </>
      )}
    </section>
  );
}

export default GamesScreen;
