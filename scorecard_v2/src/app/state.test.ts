import { describe, expect, it } from "vitest";

import type { Gameday, Game, GameLog } from "../api/types";
import { flowReducer, initialFlowState } from "./state";

const GAMEDAY = { id: 1, name: "Tag" } as Gameday;
const GAME = { id: 42 } as Game;
const LOG = { gameId: 42 } as GameLog;

describe("flowReducer", () => {
  it("walks gamedays → games → setup → tracking → finalize → result", () => {
    const games = flowReducer(initialFlowState, { type: "games", gameday: GAMEDAY });
    const setup = flowReducer(games, { type: "setup", game: GAME });
    const tracking = flowReducer(setup, {
      type: "tracking",
      game: GAME,
      log: LOG,
    });
    const finalize = flowReducer(tracking, { type: "finalize", log: LOG });
    const result = flowReducer(finalize, { type: "result", log: LOG });

    expect(games.phase).toBe("games");
    expect(games.gameday?.id).toBe(1);
    expect(setup.phase).toBe("setup");
    expect(tracking.phase).toBe("tracking");
    expect(tracking.log).toBe(LOG);
    expect(finalize.phase).toBe("finalize");
    expect(result.phase).toBe("result");
  });

  it("goes back one screen at a time", () => {
    const result = initialFlowState;
    const gamesState = flowReducer(result, { type: "games", gameday: GAMEDAY });
    expect(flowReducer(gamesState, { type: "back" }).phase).toBe("gamedays");

    const gaming = flowReducer(gamesState, { type: "setup", game: GAME });
    expect(flowReducer(gaming, { type: "back" })).toMatchObject({
      phase: "games",
      game: null,
    });

    const tracking = flowReducer(gaming, {
      type: "tracking",
      game: GAME,
      log: LOG,
    });
    expect(flowReducer(tracking, { type: "back" })).toMatchObject({
      phase: "games",
      game: null,
      log: null,
    });

    const finalizing = flowReducer(tracking, { type: "finalize", log: LOG });
    expect(flowReducer(finalizing, { type: "back" })).toMatchObject({
      phase: "tracking",
      log: LOG,
    });

    const done = flowReducer(finalizing, { type: "result", log: LOG });
    expect(flowReducer(done, { type: "back" })).toMatchObject({
      phase: "games",
      game: null,
    });
  });
});
