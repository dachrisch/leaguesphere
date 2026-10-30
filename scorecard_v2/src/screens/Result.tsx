import type { Game, GameLog, GameLogTeam } from "../api/types";
import FinalScore from "../components/FinalScore";
import Screen from "../components/Screen";

interface ResultScreenProps {
  game: Game;
  log: GameLog;
  /** Start again — the state machine returns to the game list. */
  onDone: () => void;
  /** Header chrome owned by the flow. */
  onLogout?: () => void;
}

/** The log name wins; the game row fills in for an unresolved placeholder. */
function teamName(team: GameLogTeam, fallback: string | null): string {
  const name = team.name?.trim() || fallback?.trim() || "";
  return name === "" ? "–" : name;
}

/**
 * Confirmation after the result was accepted.
 *
 * The screen only exists behind a successful `PUT /finalize` (Task 21 owns that
 * state machine): it reads the final and half-time scores from the log the
 * server answered with and offers nothing but the way back. Editing is over —
 * a finished game is read-only everywhere else too.
 */
export default function ResultScreen({
  game,
  log,
  onDone,
  onLogout,
}: ResultScreenProps) {
  return (
    <Screen
      onLogout={onLogout}
      sub={`${teamName(log.home, game.home)} – ${teamName(
        log.away,
        game.away,
      )} · Feld ${game.field}`}
      title="Ergebnis gesendet"
    >
      <div className="result">
        <div className="resultdone">
          <span aria-hidden="true" className="resultcheck">
            <svg focusable="false" viewBox="0 0 24 24">
              <path
                d="M4 12.5l5.2 5.2L20 6.8"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.4"
              />
            </svg>
          </span>
          <p className="resulttitle">Spiel beendet</p>
          <p className="resulttext">
            Das Ergebnis liegt beim Server. Weitere Einträge sind nicht mehr
            möglich.
          </p>
        </div>

        <FinalScore away={log.away} home={log.home} />

        <p className="resulthint" role="status">
          Tabelle und Liveticker sind aktuell.
        </p>

        <button className="startbtn" onClick={onDone} type="button">
          Neues Spiel
        </button>
      </div>
    </Screen>
  );
}
