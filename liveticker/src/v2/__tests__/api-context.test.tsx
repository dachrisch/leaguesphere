import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchGames } from "../api";
import {
  LivetickerProvider,
  useLiveticker,
} from "../context/LivetickerContext";
import type { Game } from "../types";
import { game } from "./fixture";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
});

function Probe() {
  const { games, loading, error } = useLiveticker();
  if (loading) return <p>loading</p>;
  if (error) return <p>{error}</p>;
  return <p>{games.length}</p>;
}

describe("fetchGames", () => {
  it("builds the league/gameday query and parses the feed", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [game],
    }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const result = await fetchGames("L", "G", controller.signal);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/liveticker/?league=L&gameday=G&results=all",
      expect.objectContaining({ signal: controller.signal }),
    );
    expect(result).toHaveLength(1);
  });

  it("asks for the full history of selected games", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [game],
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchGames("L", "G", new AbortController().signal, [1, 2]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/liveticker/?getAllTicksFor=1%2C2&league=L&gameday=G&results=all",
      expect.anything(),
    );
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503 })),
    );
    await expect(fetchGames("", "", new AbortController().signal)).rejects.toThrow(
      "503",
    );
  });
});

function ToggleProbe() {
  const { games, loading, allTicksFor, toggleAllTicks } = useLiveticker();
  if (loading) return <p>loading</p>;
  return (
    <>
      <button type="button" onClick={() => toggleAllTicks(games[0].gameId)}>
        toggle
      </button>
      <p>{allTicksFor.join(",")}</p>
    </>
  );
}

function MissingProbe() {
  const { games, loading, error, linkedGameMissing } = useLiveticker();
  if (loading) return <p>loading</p>;
  if (error) return <p>{error}</p>;
  return <p>{linkedGameMissing ? "missing" : `games:${games.length}`}</p>;
}

describe("LivetickerProvider", () => {
  it("loads the feed and exposes it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => [game] })),
    );
    render(
      <LivetickerProvider>
        <Probe />
      </LivetickerProvider>,
    );
    expect(screen.getByText("loading")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
  });

  it("keeps an expanded game in the next poll", async () => {
    const fetchMock = vi.fn(async (input?: string) => {
      void input;
      return { ok: true, json: async () => [game] };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <LivetickerProvider>
        <ToggleProbe />
      </LivetickerProvider>,
    );
    const toggle = await screen.findByRole("button", { name: "toggle" });
    await userEvent.click(toggle);
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("getAllTicksFor=1");
  });

  it("ignores an aborted request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("aborted", "AbortError");
      }),
    );
    render(
      <LivetickerProvider>
        <Probe />
      </LivetickerProvider>,
    );
    await waitFor(() => expect(screen.getByText("0")).toBeInTheDocument());
    expect(
      screen.queryByText("Der Liveticker konnte nicht geladen werden."),
    ).not.toBeInTheDocument();
  });

  it("reports a failed request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    render(
      <LivetickerProvider>
        <Probe />
      </LivetickerProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByText("Der Liveticker konnte nicht geladen werden."),
      ).toBeInTheDocument(),
    );
  });

  it("asks again for a linked game that is not in the first payload", async () => {
    window.history.replaceState(
      {},
      "",
      "/liveticker/v2/gameday/2/game/1/",
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [game] });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LivetickerProvider>
        <Probe />
      </LivetickerProvider>,
    );

    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("getAllTicksFor=1");
  });

  it("asks once and then reports a linked game that is still missing", async () => {
    window.history.replaceState(
      {},
      "",
      "/liveticker/v2/gameday/2/game/1/",
    );
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [] }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LivetickerProvider>
        <MissingProbe />
      </LivetickerProvider>,
    );

    await waitFor(() => expect(screen.getByText("missing")).toBeInTheDocument());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => {});
  });

  it("ignores a response that arrives after unmount", async () => {
    type Response = { ok: boolean; json: () => Promise<Game[]> };
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(
      <LivetickerProvider>
        <Probe />
      </LivetickerProvider>,
    );
    unmount();

    await act(async () => {
      resolveFetch?.({ ok: true, json: async () => [game] });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("reuses the retried tick request when the history is opened", async () => {
    window.history.replaceState(
      {},
      "",
      "/liveticker/v2/gameday/2/game/1/",
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValue({ ok: true, json: async () => [game] });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LivetickerProvider>
        <ToggleProbe />
      </LivetickerProvider>,
    );
    const toggle = await screen.findByRole("button", { name: "toggle" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await userEvent.click(toggle);

    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
    // "Alle Ereignisse" stays UI state: no query parameter is written.
    expect(window.location.search).toBe("");
  });

  it("requires a provider", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(
      "useLiveticker() needs a LivetickerProvider",
    );
    error.mockRestore();
  });

  it("keeps the URL-selected game across a poll and leaves the URL alone", async () => {
    vi.useFakeTimers();
    window.history.replaceState(
      {},
      "",
      "/liveticker/v2/gameday/2/game/1/",
    );
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [game] }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LivetickerProvider>
        <Probe />
      </LivetickerProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(window.location.pathname).toBe(
      "/liveticker/v2/gameday/2/game/1/",
    );
    expect(window.location.search).toBe("");
  });
});
