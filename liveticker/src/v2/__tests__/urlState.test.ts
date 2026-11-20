import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readUrlState,
  replaceGame,
  selectGame,
  tickerPath,
  useUrlState,
} from "../urlState";

beforeEach(() => {
  window.history.replaceState({}, "", "/liveticker/v2/");
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("url state", () => {
  it("reads the root as today's gamedays", () => {
    expect(readUrlState()).toEqual({ gameday: null, gameId: null });
  });

  it("reads a gameday path", () => {
    window.history.replaceState({}, "", "/liveticker/v2/gameday/888/");

    expect(readUrlState()).toEqual({ gameday: 888, gameId: null });
  });

  it("reads a game path", () => {
    window.history.replaceState(
      {},
      "",
      "/liveticker/v2/gameday/888/game/9314/",
    );

    expect(readUrlState()).toEqual({ gameday: 888, gameId: 9314 });
  });

  it("ignores an unrelated path", () => {
    window.history.replaceState({}, "", "/gamedays/");

    expect(readUrlState()).toEqual({ gameday: null, gameId: null });
  });

  it("builds the canonical paths", () => {
    expect(tickerPath({ gameday: null })).toBe("/liveticker/v2/");
    expect(tickerPath({ gameday: 888 })).toBe("/liveticker/v2/gameday/888/");
    expect(tickerPath({ gameday: 888, gameId: 9314 })).toBe(
      "/liveticker/v2/gameday/888/game/9314/",
    );
  });

  it("pushes a game path and never writes a query", () => {
    selectGame(888, 9314);

    expect(window.location.pathname).toBe(
      "/liveticker/v2/gameday/888/game/9314/",
    );
    expect(window.location.search).toBe("");
  });

  it("clears the game again with the gameday path", () => {
    window.history.replaceState(
      {},
      "",
      "/liveticker/v2/gameday/888/game/9314/",
    );

    selectGame(888, null);

    expect(window.location.pathname).toBe("/liveticker/v2/gameday/888/");
    expect(window.location.search).toBe("");
  });

  it("replaces the entry for an auto-selection", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");

    replaceGame(888, 9314);

    expect(window.location.pathname).toBe(
      "/liveticker/v2/gameday/888/game/9314/",
    );
    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("does not write the same path twice", () => {
    window.history.replaceState({}, "", "/liveticker/v2/gameday/888/");
    const push = vi.spyOn(window.history, "pushState");

    selectGame(888, null);

    expect(push).not.toHaveBeenCalled();
  });

  it("restores the state on popstate", () => {
    const { result } = renderHook(() => useUrlState());
    expect(result.current.gameId).toBeNull();

    act(() => {
      window.history.pushState(
        {},
        "",
        "/liveticker/v2/gameday/2/game/3/",
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(result.current).toEqual({ gameday: 2, gameId: 3 });
  });
});
