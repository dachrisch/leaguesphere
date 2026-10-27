/**
 * The flow state machine. No router: the whole app is one page, and the six
 * screens are six states. The reducer keeps the selection (gameday, game, log)
 * so "back" never has to re-open a game, and the App owns the fetches.
 */
import type { Gameday, Game, GameLog } from "../api/types";

export type Phase =
  | "gamedays"
  | "games"
  | "setup"
  | "tracking"
  | "finalize"
  | "result";

export interface FlowState {
  phase: Phase;
  gameday: Gameday | null;
  game: Game | null;
  /** The log as it was last handed over; tracking keeps its own live copy. */
  log: GameLog | null;
}

export const initialFlowState: FlowState = {
  phase: "gamedays",
  gameday: null,
  game: null,
  log: null,
};

export type FlowAction =
  | { type: "gamedays" }
  | { type: "games"; gameday: Gameday }
  | { type: "setup"; game: Game }
  | { type: "tracking"; game: Game; log: GameLog }
  | { type: "finalize"; log: GameLog }
  | { type: "result"; log: GameLog }
  | { type: "back" };

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "gamedays":
      return initialFlowState;
    case "games":
      return { phase: "games", gameday: action.gameday, game: null, log: null };
    case "setup":
      return { ...state, phase: "setup", game: action.game, log: null };
    case "tracking":
      return {
        ...state,
        phase: "tracking",
        game: action.game,
        log: action.log,
      };
    case "finalize":
      return { ...state, phase: "finalize", log: action.log };
    case "result":
      return { ...state, phase: "result", log: action.log };
    case "back":
      return back(state);
  }
}

function back(state: FlowState): FlowState {
  switch (state.phase) {
    case "games":
      // The gameday is dropped with its games; the list reloads on return.
      return initialFlowState;
    case "setup":
      return { ...state, phase: "games", game: null };
    case "tracking":
      // Leaving a running game does not end it: the game stays `läuft` in the
      // list and reopening resumes from the server log.
      return { ...state, phase: "games", game: null, log: null };
    case "finalize":
      return { ...state, phase: "tracking" };
    case "result":
      return { ...state, phase: "games", game: null, log: null };
    default:
      return state;
  }
}
