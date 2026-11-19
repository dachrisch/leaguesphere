import { ContextHeader } from "./components/ContextHeader";
import { EventList } from "./components/EventList";
import { Scoreboard } from "./components/Scoreboard";
import { useLiveticker } from "./context/LivetickerContext";
import { selectLiveGame } from "./selectors";

export default function App() {
  const { games, loading, error } = useLiveticker();
  const game = selectLiveGame(games);

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

  if (!game) {
    return (
      <main className="lt-app">
        <header className="lt-context">
          <p className="lt-kicker">Liveticker</p>
          <h1>Kein Spiel läuft</h1>
        </header>
        <p className="lt-status">Der Ticker startet mit dem Anpfiff.</p>
      </main>
    );
  }

  return (
    <main className="lt-app">
      <ContextHeader game={game} />
      <Scoreboard game={game} />
      <EventList game={game} />
    </main>
  );
}
