import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchGames } from "../api";
import {
  LivetickerProvider,
  useLiveticker,
} from "../context/LivetickerContext";
import { game } from "./fixture";

afterEach(() => {
  vi.unstubAllGlobals();
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
      "/api/liveticker/?league=L&gameday=G",
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
      "/api/liveticker/?getAllTicksFor=1%2C2&league=L&gameday=G",
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
});
