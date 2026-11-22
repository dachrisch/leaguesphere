import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { LivetickerProvider } from "../context/LivetickerContext";
import type { Game } from "../types";
import { game } from "./fixture";

const GAMEDAY_PATH = "/liveticker/v2/gameday/2/";
const gamePath = (id: number) => `/liveticker/v2/gameday/2/game/${id}/`;

const liveGame: Game = { ...game, gameId: 1 };

const secondTick: Game = {
  ...liveGame,
  tick_count: 2,
  ticks: [
    {
      text: "Run: #9 - 3 Yards",
      type: "run",
      team: "home",
      time: "2026-08-15T12:10:00+00:00",
    },
    ...liveGame.ticks,
  ],
};

class MockEventSource {
  static instances: MockEventSource[] = [];

  static last(): MockEventSource {
    return this.instances[this.instances.length - 1];
  }

  url: string;
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  private listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      list.filter((candidate) => candidate !== listener),
    );
  }

  close() {
    this.closed = true;
    this.readyState = 2;
  }

  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  snapshot(games: Game[], id = "v1") {
    const event = new MessageEvent("snapshot", {
      data: JSON.stringify(games),
      lastEventId: id,
    });
    for (const listener of this.listeners.get("snapshot") ?? []) listener(event);
  }

  fail() {
    this.onerror?.(new Event("error"));
  }

  brokenSnapshot() {
    const event = new MessageEvent("snapshot", { data: "not json" });
    for (const listener of this.listeners.get("snapshot") ?? []) listener(event);
  }
}

function renderTicker(path = GAMEDAY_PATH) {
  window.history.replaceState({}, "", path);
  render(
    <LivetickerProvider streamEnabled>
      <App />
    </LivetickerProvider>,
  );
}

function connectionText(): string {
  return document.querySelector(".lt-connection")?.textContent ?? "";
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => [] })),
  );
  setVisibility("visible");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("live stream", () => {
  it("opens the stream with the current query and applies each snapshot", () => {
    renderTicker();

    const source = MockEventSource.last();
    expect(source.url).toContain("/api/liveticker/stream/?");
    expect(source.url).toContain("gameday=2");
    expect(source.url).toContain("results=all");
    expect(source.url).not.toContain("league=");

    act(() => {
      source.open();
      source.snapshot([liveGame]);
    });

    expect(screen.getAllByText("Walldorf Wanderers").length).toBeGreaterThan(0);
    expect(connectionText()).toBe("");
    expect(document.querySelector(".lt-connection")).toBeNull();
  });

  it("reconnects with getAllTicksFor when the full history is opened", async () => {
    renderTicker(gamePath(1));
    act(() => {
      MockEventSource.last().open();
      MockEventSource.last().snapshot([{ ...liveGame, tick_count: 5 }]);
    });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Alle 5 Ereignisse" }));
    });

    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.last().url).toContain("getAllTicksFor=1");
    expect(MockEventSource.instances[0].closed).toBe(true);
  });

  it("falls back to polling after repeated errors and retries with backoff", async () => {
    renderTicker();
    const source = MockEventSource.last();
    act(() => {
      source.open();
      source.snapshot([liveGame]);
    });

    act(() => source.fail());
    act(() => source.fail());
    expect(connectionText()).toContain("Verbindung wird wiederhergestellt");

    act(() => source.fail());
    expect(connectionText()).toContain("Aktualisierung alle 60 s");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/liveticker/?"),
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.last().closed).toBe(false);
  });

  it("treats a refused stream (503) the same as any connect failure", async () => {
    renderTicker();
    const source = MockEventSource.last();
    act(() => source.fail());
    act(() => source.fail());
    act(() => source.fail());

    // The polling fallback replaces "Lade Liveticker …" with the page.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(connectionText()).toContain("Aktualisierung alle 60 s");
    expect(source.closed).toBe(true);
  });

  it("pauses a hidden tab after a minute and resumes with a fresh snapshot", () => {
    renderTicker();
    const first = MockEventSource.last();
    act(() => {
      first.open();
      first.snapshot([liveGame]);
    });

    act(() => setVisibility("hidden"));
    act(() => vi.advanceTimersByTime(60_001));
    expect(first.closed).toBe(true);

    act(() => setVisibility("visible"));
    expect(MockEventSource.instances).toHaveLength(2);

    const second = MockEventSource.last();
    act(() => {
      second.open();
      second.snapshot([secondTick]);
    });
    expect(screen.getByText("#9 - 3 Yards")).toBeInTheDocument();
    expect(document.querySelector(".lt-connection")).toBeNull();
  });

  it("falls back when the connection never opens", async () => {
    renderTicker();
    const source = MockEventSource.last();

    act(() => vi.advanceTimersByTime(10_000));
    await act(async () => {
      await Promise.resolve();
    });

    expect(source.closed).toBe(true);
    expect(connectionText()).toContain("Aktualisierung alle 60 s");
  });

  it("ignores a malformed frame instead of tearing down the stream", () => {
    renderTicker();
    const source = MockEventSource.last();
    act(() => {
      source.open();
      source.snapshot([liveGame]);
    });

    act(() => source.brokenSnapshot());

    expect(source.closed).toBe(false);
    expect(document.querySelector(".lt-connection")).toBeNull();
    expect(screen.getAllByText("Walldorf Wanderers").length).toBeGreaterThan(0);
  });

  it("highlights newly arrived events briefly", () => {
    renderTicker();
    const source = MockEventSource.last();
    act(() => {
      source.open();
      source.snapshot([liveGame]);
    });
    expect(document.querySelectorAll(".lt-event-new")).toHaveLength(0);

    act(() => source.snapshot([secondTick], "v2"));
    expect(document.querySelectorAll(".lt-event-new")).toHaveLength(1);

    act(() => vi.advanceTimersByTime(3_000));
    expect(document.querySelectorAll(".lt-event-new")).toHaveLength(0);
  });

  it("keeps the existing event nodes so aria-live announces only new ones", () => {
    renderTicker();
    const source = MockEventSource.last();
    act(() => {
      source.open();
      source.snapshot([liveGame]);
    });
    const existing = screen.getByText("#7 - 45 Yards").closest("li");
    expect(existing).not.toBeNull();

    act(() => source.snapshot([secondTick], "v2"));

    const list = document.querySelector(".lt-events");
    expect(list).toHaveAttribute("aria-live", "polite");
    expect(list).toHaveAttribute("aria-atomic", "false");
    expect(screen.getByText("#7 - 45 Yards").closest("li")).toBe(existing);
  });
});
