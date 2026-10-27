/**
 * Executes the real worker template against a fake worker global.
 *
 * The Django tests can only inspect the rendered source; this test runs it, so
 * a dead handler (an install that writes nothing, a navigation that never
 * responds, a logout that deletes the shell) fails here instead of on a
 * sideline with no network.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// Loaded raw: vitest transforms the same file Django serves, with no node
// types needed (the project has none).
import TEMPLATE from "../static/scorecard_v2/sw.js?raw";

const ORIGIN = "https://scorecard.test";
const APP_SHELL = "/static/scorecard_v2/app-shell.html";
const OFFLINE = "/static/scorecard_v2/offline.html";
const BUNDLE = "/static/scorecard_v2/js/scorecard_v2.js";
const CSS = "/static/scorecard_v2/js/scorecard_v2.css";
const TEAM_LOGO = "/media/teammanager/logos/ravens.png";
/** Mirrors `MEDIA_CACHE_LIMIT` in the worker: how many logos it keeps. */
const LOGO_CACHE_LIMIT = 60;
const VERSION = "4.43.1-abc123def456";
const PRECACHE_PATHS = [
  APP_SHELL,
  OFFLINE,
  "/static/scorecard_v2/manifest.webmanifest",
  CSS,
  BUNDLE,
];

interface FakeResponse {
  readonly url: string;
  readonly ok: boolean;
  readonly type: string;
  clone(): FakeResponse;
}

interface FakeRequest {
  readonly method: string;
  readonly mode: string;
  readonly url: string;
}

interface FetchInit {
  readonly cache?: string;
  readonly signal?: AbortSignal;
}

type FetchCall = (
  input: string | FakeRequest,
  init?: FetchInit,
) => Promise<FakeResponse>;

interface WorkerEvent {
  request?: FakeRequest;
  data?: unknown;
  respondWith?: (response: Promise<unknown>) => void;
  waitUntil?: (promise: Promise<unknown>) => void;
}

type WorkerListener = (event: WorkerEvent) => void;

function requestPath(input: string | FakeRequest): string {
  const url = typeof input === "string" ? input : input.url;
  return new URL(url, ORIGIN).pathname;
}

function responseFor(input: string | FakeRequest): FakeResponse {
  const response: FakeResponse = {
    url: requestPath(input),
    ok: true,
    type: "basic",
    clone: () => response,
  };
  return response;
}

function renderWorker(precache: string[]): string {
  const values: Record<string, string> = {
    cache_version: VERSION,
    app_scope: "/scorecard/v2/",
    static_prefix: "/static/scorecard_v2/",
    app_shell_url: APP_SHELL,
    offline_url: OFFLINE,
    "precache_urls|safe": JSON.stringify(precache),
  };
  const body = TEMPLATE.replace(
    /\{\{\s*([a-z_|]+)\s*\}\}/g,
    (match: string, key: string) => {
      const value = values[key];
      if (value === undefined) {
        throw new Error(`unrendered worker placeholder: ${match}`);
      }
      return value;
    },
  );
  if (body.includes("{{")) {
    throw new Error("worker template has unrendered placeholders");
  }
  return body;
}

interface FakeCache {
  put(request: string | FakeRequest, response: FakeResponse): Promise<void>;
  match(request: string | FakeRequest): Promise<FakeResponse | undefined>;
  keys(): Promise<FakeRequest[]>;
  delete(request: string | FakeRequest): Promise<boolean>;
}

function createCaches(failWrites: boolean) {
  const store = new Map<string, Map<string, FakeResponse>>();

  function entries(name: string): Map<string, FakeResponse> {
    let cache = store.get(name);
    if (cache === undefined) {
      cache = new Map();
      store.set(name, cache);
    }
    return cache;
  }

  return {
    store,
    async open(name: string): Promise<FakeCache> {
      const cache = entries(name);
      return {
        async put(request, response) {
          if (failWrites) {
            throw new Error("QuotaExceededError");
          }
          cache.set(requestPath(request), response);
        },
        async match(request) {
          return cache.get(requestPath(request));
        },
        async keys() {
          // Insertion order, like a real Cache.
          return [...cache.keys()].map((path) => ({
            method: "GET",
            mode: "cors",
            url: `${ORIGIN}${path}`,
          }));
        },
        async delete(request) {
          return cache.delete(requestPath(request));
        },
      };
    },
    async keys(): Promise<string[]> {
      return [...store.keys()];
    },
    async delete(name: string): Promise<boolean> {
      return store.delete(name);
    },
  };
}

function createWorker(
  options: { precache?: string[]; fetch?: FetchCall; failWrites?: boolean } = {},
) {
  const listeners = new Map<string, WorkerListener>();
  const caches = createCaches(options.failWrites ?? false);
  const fetchMock = vi.fn(
    options.fetch ?? ((input: string | FakeRequest) => Promise.resolve(responseFor(input))),
  );
  const self = {
    location: { origin: ORIGIN },
    clients: { claim: vi.fn(() => Promise.resolve()) },
    skipWaiting: vi.fn(() => Promise.resolve()),
    addEventListener: (type: string, listener: WorkerListener) => {
      listeners.set(type, listener);
    },
  };

  const body = renderWorker(options.precache ?? PRECACHE_PATHS);
  // `new Function` is the point: it executes the file the server renders.
  const factory = new Function("self", "caches", "fetch", "Response", body);
  factory(self, caches, fetchMock, Response);

  function listener(type: string): WorkerListener {
    const registered = listeners.get(type);
    if (registered === undefined) {
      throw new Error(`worker did not register a "${type}" listener`);
    }
    return registered;
  }

  async function runWaitUntil(type: string, event: WorkerEvent): Promise<void> {
    const waits: Promise<unknown>[] = [];
    listener(type)({
      ...event,
      waitUntil: (promise) => waits.push(promise),
    });
    await Promise.all(waits);
  }

  return {
    caches,
    fetchMock,
    self,
    precacheName: `scorecard-v2-precache-${VERSION}`,
    runtimeName: `scorecard-v2-runtime-${VERSION}`,
    runInstall: () => runWaitUntil("install", {}),
    runActivate: () => runWaitUntil("activate", {}),
    postMessage: (data: unknown) => runWaitUntil("message", { data }),
    dispatchFetch(request: FakeRequest): Promise<unknown> | undefined {
      let responded: Promise<unknown> | undefined;
      listener("fetch")({
        request,
        respondWith: (promise) => {
          responded = promise;
        },
      });
      return responded;
    },
  };
}

function navigation(url: string): FakeRequest {
  return { method: "GET", mode: "navigate", url };
}

function asset(path: string): FakeRequest {
  return { method: "GET", mode: "cors", url: `${ORIGIN}${path}` };
}

describe("rendered service worker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("installs the app shell, bundle and stylesheet into its own precache", async () => {
    const worker = createWorker();

    await worker.runInstall();

    const entries = worker.caches.store.get(worker.precacheName);
    expect(entries).toBeDefined();
    for (const path of PRECACHE_PATHS) {
      expect(entries?.has(path)).toBe(true);
    }
    // The snapshot bypasses the HTTP cache.
    expect(worker.fetchMock).toHaveBeenCalledWith(APP_SHELL, { cache: "reload" });
    expect(worker.self.skipWaiting).toHaveBeenCalled();
  });

  it("does not intercept POSTs or /api/ requests", () => {
    const worker = createWorker();

    expect(
      worker.dispatchFetch({
        method: "POST",
        mode: "cors",
        url: `${ORIGIN}/scorecard/v2/`,
      }),
    ).toBeUndefined();
    expect(
      worker.dispatchFetch({
        method: "GET",
        mode: "cors",
        url: `${ORIGIN}/api/gamelog/1`,
      }),
    ).toBeUndefined();
  });

  it("answers an offline navigation with the app shell", async () => {
    const worker = createWorker();
    await worker.runInstall();
    worker.fetchMock.mockRejectedValue(new Error("offline"));

    const result = await worker.dispatchFetch(
      navigation(`${ORIGIN}/scorecard/v2/`),
    );

    expect(result).toEqual(expect.objectContaining({ url: APP_SHELL }));
  });

  it("treats /scorecard/v2 without a trailing slash as a navigation", async () => {
    const worker = createWorker();
    await worker.runInstall();
    worker.fetchMock.mockRejectedValue(new Error("offline"));

    const result = await worker.dispatchFetch(
      navigation(`${ORIGIN}/scorecard/v2`),
    );

    expect(result).toEqual(expect.objectContaining({ url: APP_SHELL }));
  });

  it("falls back to the shell once the navigation timeout aborts the fetch", async () => {
    vi.useFakeTimers();
    const worker = createWorker({
      fetch: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    });
    const cache = await worker.caches.open(worker.precacheName);
    await cache.put(APP_SHELL, responseFor(APP_SHELL));

    const pending = worker.dispatchFetch(navigation(`${ORIGIN}/scorecard/v2/`));
    await vi.advanceTimersByTimeAsync(4000);

    expect(await pending).toEqual(expect.objectContaining({ url: APP_SHELL }));
  });

  it("clears runtime caches on logout but keeps the precache", async () => {
    const worker = createWorker();
    await worker.runInstall();
    const runtime = await worker.caches.open(worker.runtimeName);
    await runtime.put(BUNDLE, responseFor(BUNDLE));

    await worker.postMessage({ type: "logout" });

    expect(worker.caches.store.has(worker.runtimeName)).toBe(false);
    expect(worker.caches.store.has(worker.precacheName)).toBe(true);
  });

  it("still mounts the shell offline after a logout", async () => {
    const worker = createWorker();
    await worker.runInstall();
    const runtime = await worker.caches.open(worker.runtimeName);
    await runtime.put(BUNDLE, responseFor(BUNDLE));
    await worker.postMessage({ type: "logout" });
    worker.fetchMock.mockRejectedValue(new Error("offline"));

    const result = await worker.dispatchFetch(
      navigation(`${ORIGIN}/scorecard/v2/`),
    );

    expect(result).toEqual(expect.objectContaining({ url: APP_SHELL }));
  });

  it("returns a good static response even when the cache write fails", async () => {
    const worker = createWorker({ failWrites: true });

    await worker.runInstall();
    const result = await worker.dispatchFetch({
      method: "GET",
      mode: "no-cors",
      url: `${ORIGIN}${BUNDLE}`,
    });

    expect(result).toEqual(expect.objectContaining({ url: BUNDLE }));
  });

  it("caches a team logo so an offline boot still shows it", async () => {
    const worker = createWorker();

    const online = await worker.dispatchFetch(asset(TEAM_LOGO));
    expect(online).toEqual(expect.objectContaining({ url: TEAM_LOGO }));
    expect(worker.caches.store.get(worker.runtimeName)?.has(TEAM_LOGO)).toBe(
      true,
    );

    worker.fetchMock.mockRejectedValue(new Error("offline"));
    const offline = await worker.dispatchFetch(asset(TEAM_LOGO));

    expect(offline).toEqual(expect.objectContaining({ url: TEAM_LOGO }));
  });

  it("lets a never-cached logo fail offline, so the app falls back to initials", async () => {
    const worker = createWorker({
      fetch: () => Promise.reject(new Error("offline")),
    });

    await expect(worker.dispatchFetch(asset(TEAM_LOGO))).rejects.toThrow(
      "offline",
    );
  });

  it("leaves other /media/ paths to the browser", () => {
    const worker = createWorker();

    expect(
      worker.dispatchFetch(asset("/media/other/handout.pdf")),
    ).toBeUndefined();
    expect(
      worker.dispatchFetch(asset("/media/teammanager/news/banner.png")),
    ).toBeUndefined();
    expect(worker.caches.store.get(worker.runtimeName)?.size ?? 0).toBe(0);
  });

  it("keeps the logo cache bounded to the newest entries", async () => {
    const worker = createWorker();
    const total = LOGO_CACHE_LIMIT + 2;

    for (let index = 0; index < total; index += 1) {
      await worker.dispatchFetch(
        asset(`/media/teammanager/logos/logo-${index}.png`),
      );
    }

    const cached = [...(worker.caches.store.get(worker.runtimeName)?.keys() ?? [])];
    expect(cached).toHaveLength(LOGO_CACHE_LIMIT);
    expect(cached).not.toContain("/media/teammanager/logos/logo-0.png");
    expect(cached).not.toContain("/media/teammanager/logos/logo-1.png");
    expect(cached).toContain(
      `/media/teammanager/logos/logo-${total - 1}.png`,
    );
    // Static assets live in the same runtime cache and are never pruned.
    await worker.dispatchFetch({
      method: "GET",
      mode: "no-cors",
      url: `${ORIGIN}${BUNDLE}`,
    });
    expect(worker.caches.store.get(worker.runtimeName)?.has(BUNDLE)).toBe(true);
  });

  it("still never caches /api/ requests", async () => {
    const worker = createWorker();

    expect(
      worker.dispatchFetch({
        method: "GET",
        mode: "cors",
        url: `${ORIGIN}/api/teams/`,
      }),
    ).toBeUndefined();
    expect(worker.caches.store.get(worker.runtimeName)?.size ?? 0).toBe(0);
  });
});
