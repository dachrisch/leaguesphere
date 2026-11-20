import { useEffect, useRef, useState } from "react";

import { streamUrl } from "../api";
import type { Game } from "../types";

/**
 * ``live``: the EventSource is connected and snapshots arrive on change.
 * ``reconnecting``: the browser (or we) are re-establishing the stream.
 * ``polling``: the stream is unavailable; the app falls back to the 60 s GET.
 */
export type StreamStatus = "live" | "reconnecting" | "polling";

interface UseLivetickerStreamOptions {
  enabled: boolean;
  league: string;
  gameday: string;
  allTicksFor: number[];
  onSnapshot: (games: Game[]) => void;
}

/** Retry the stream after a fallback, backing off so a broken stage cannot
 *  be hammered by every open tab. */
const RETRY_DELAYS = [30_000, 60_000, 120_000];
/** EventSource retries a few times on its own; after this many errors we take
 *  over, fall back to polling and retry with the delays above. */
const ERROR_LIMIT = 3;
/** A hidden tab keeps its stream for a minute, then releases it. */
const HIDDEN_PAUSE_MS = 60_000;
/** No open/snapshot within this window counts as a failed attempt. */
const CONNECT_TIMEOUT_MS = 10_000;

export function useLivetickerStream({
  enabled,
  league,
  gameday,
  allTicksFor,
  onSnapshot,
}: UseLivetickerStreamOptions): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>("reconnecting");
  const snapshotRef = useRef(onSnapshot);
  useEffect(() => {
    snapshotRef.current = onSnapshot;
  }, [onSnapshot]);
  // Arrays are new on every render; the joined value is the real dependency.
  const ticksKey = allTicksFor.join(",");

  useEffect(() => {
    if (!enabled) return;

    const url = streamUrl(league, gameday, ticksKey ? ticksKey.split(",").map(Number) : []);
    let disposed = false;
    let source: EventSource | null = null;
    let errors = 0;
    let retryIndex = 0;
    let paused = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pauseTimer: ReturnType<typeof setTimeout> | undefined;
    let connectTimer: ReturnType<typeof setTimeout> | undefined;

    const clear = (timer: ReturnType<typeof setTimeout> | undefined) => {
      if (timer !== undefined) clearTimeout(timer);
    };

    const close = () => {
      source?.close();
      source = null;
      clear(connectTimer);
      connectTimer = undefined;
    };

    const retryLater = () => {
      close();
      setStatus("polling");
      const delay = RETRY_DELAYS[Math.min(retryIndex, RETRY_DELAYS.length - 1)];
      retryIndex += 1;
      clear(retryTimer);
      retryTimer = setTimeout(() => {
        if (disposed) return;
        errors = 0;
        open();
      }, delay);
    };

    const open = () => {
      if (disposed) return;
      close();
      const next = new EventSource(url);
      source = next;
      setStatus("reconnecting");
      connectTimer = setTimeout(() => {
        // A connection that never opens must not leave the page loading
        // forever: fall back to polling like an error would.
        if (next.readyState !== 1) retryLater();
      }, CONNECT_TIMEOUT_MS);

      next.onopen = () => {
        errors = 0;
        clear(connectTimer);
        setStatus("live");
      };

      next.addEventListener("snapshot", (event) => {
        const message = event as MessageEvent<string>;
        let games: Game[];
        try {
          games = JSON.parse(message.data) as Game[];
        } catch {
          // A broken frame must not tear down a working connection.
          return;
        }
        errors = 0;
        retryIndex = 0;
        paused = false;
        clear(connectTimer);
        setStatus("live");
        snapshotRef.current(games);
      });

      next.onerror = () => {
        errors += 1;
        if (errors < ERROR_LIMIT) {
          // EventSource retries by itself; keep the indicator honest.
          setStatus("reconnecting");
          return;
        }
        retryLater();
      };
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clear(pauseTimer);
        pauseTimer = setTimeout(() => {
          // Hidden for over a minute: release the connection (and its slot)
          // rather than keep a stream nobody reads.
          paused = true;
          close();
          setStatus("reconnecting");
        }, HIDDEN_PAUSE_MS);
        return;
      }

      clear(pauseTimer);
      if (paused) {
        paused = false;
        errors = 0;
        retryIndex = 0;
        clear(retryTimer);
        // Reconnect immediately: the server answers with a snapshot, so the
        // tab catches up in one round trip.
        open();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    open();

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      close();
      clear(retryTimer);
      clear(pauseTimer);
    };
  }, [enabled, league, gameday, ticksKey]);

  // Derived, not written in the effect: flipping the switch off must show the
  // polling state without a second render pass.
  return enabled ? status : "polling";
}
