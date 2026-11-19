import { render, screen, waitFor } from "@testing-library/react";
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
