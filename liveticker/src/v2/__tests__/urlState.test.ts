import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readUrlState, selectGame, toggleAll, useUrlState } from "../urlState";

beforeEach(() => {
  window.history.replaceState({}, "", "/liveticker/v2/?league=L&gameday=G");
});

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("url state", () => {
  it("reads league, gameday, game and all", () => {
    window.history.replaceState(
      {},
      "",
      "/liveticker/v2/?league=L&gameday=G&game=7&all=1",
    );

    expect(readUrlState()).toEqual({
      league: "L",
      gameday: "G",
      gameId: 7,
      all: true,
    });
  });

  it("ignores a game that is not a number", () => {
    window.history.replaceState({}, "", "/liveticker/v2/?game=abc&all=0");

    expect(readUrlState().gameId).toBeNull();
    expect(readUrlState().all).toBe(false);
  });

  it("pushes a deep link and keeps the filters", () => {
    selectGame(7);

    const params = new URLSearchParams(window.location.search);
    expect(params.get("league")).toBe("L");
    expect(params.get("gameday")).toBe("G");
    expect(params.get("game")).toBe("7");
    expect(params.get("all")).toBeNull();
  });

  it("clears an open history when another game is selected", () => {
    window.history.replaceState({}, "", "/liveticker/v2/?game=7&all=1");

    selectGame(8);

    const params = new URLSearchParams(window.location.search);
    expect(params.get("game")).toBe("8");
    expect(params.get("all")).toBeNull();
  });

  it("removes the game parameter again", () => {
    window.history.replaceState({}, "", "/liveticker/v2/?game=7");

    selectGame(null);

    expect(new URLSearchParams(window.location.search).get("game")).toBeNull();
  });

  it("toggles the full history of the selected game", () => {
    selectGame(7);

    toggleAll(7);
    expect(readUrlState().all).toBe(true);

    toggleAll(7);
    expect(readUrlState().all).toBe(false);
  });

  it("opens the history of a game that is not linked yet", () => {
    toggleAll(7);

    const state = readUrlState();
    expect(state.gameId).toBe(7);
    expect(state.all).toBe(true);
  });

  it("restores the state on popstate", () => {
    const { result } = renderHook(() => useUrlState());
    expect(result.current.gameId).toBeNull();

    act(() => {
      window.history.pushState({}, "", "/liveticker/v2/?game=3");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(result.current.gameId).toBe(3);
  });
});
