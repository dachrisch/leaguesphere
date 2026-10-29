/*
 * LeagueSphere Scorecard v2 service worker.
 *
 * Served by scorecard_v2.views.ServiceWorkerView from /scorecard/v2/sw.js, so
 * the scope is exactly this app. Django renders the cache version and the
 * precache list into it (see scorecard_v2/views.py — precache_assets() is the
 * single source of truth, tests/test_pwa.py checks every entry resolves and
 * src/swWorker.test.ts executes this file against a fake worker global).
 *
 * Cache policy, on purpose:
 *   - navigations: network first (4 s timeout), then the static app shell so
 *     the SPA can mount from IndexedDB. The Django-rendered page carries a
 *     session-gated CSRF cookie and is never stored.
 *   - /static/scorecard_v2/**: network first, runtime cache fallback, then the
 *     install-time precache. The bundle name is fixed by vite.config.ts, so
 *     cache-first would pin a stale build.
 *   - /api/**: never touched. The outbox owns match data, not the worker.
 *   - non-GET: not intercepted.
 *
 * Two caches, because logout must not delete the app's own shell:
 *   - scorecard-v2-precache-<version>: the install snapshot. Survives logout.
 *   - scorecard-v2-runtime-<version>: per-session static responses. Logout
 *     clears it.
 */

const CACHE_PREFIX = "scorecard-v2-";
const PRECACHE_PREFIX = CACHE_PREFIX + "precache-";
const RUNTIME_PREFIX = CACHE_PREFIX + "runtime-";
const CACHE_VERSION = "{{ cache_version }}";
const PRECACHE_NAME = PRECACHE_PREFIX + CACHE_VERSION;
const RUNTIME_NAME = RUNTIME_PREFIX + CACHE_VERSION;

const APP_SCOPE = "{{ app_scope }}";
const APP_SCOPE_BARE = APP_SCOPE.replace(/\/+$/, "");
const STATIC_PREFIX = "{{ static_prefix }}";
const APP_SHELL_URL = "{{ app_shell_url }}";
const OFFLINE_URL = "{{ offline_url }}";
const NAVIGATION_TIMEOUT_MS = 4000;
const PRECACHE_URLS = {{ precache_urls|safe }};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE_NAME);
      // One missing asset must not kill the install, so every URL is fetched
      // on its own. `cache: "reload"` bypasses the HTTP cache: the snapshot is
      // what this deploy actually serves, not yesterday's CDN copy.
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (!response.ok) {
              return;
            }
            await cache.put(url, response);
          } catch (error) {
            // Keep the other assets: a partially complete shell still boots.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith(CACHE_PREFIX) &&
              key !== PRECACHE_NAME &&
              key !== RUNTIME_NAME,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // Match data belongs to the outbox (IndexedDB), never to a cache.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    // Only the app's own pages get the offline shell — another app's page must
    // never be answered with ours.
    if (isAppPath(url.pathname)) {
      event.respondWith(networkFirstNavigation(request));
    }
    return;
  }

  if (url.pathname.startsWith(STATIC_PREFIX)) {
    event.respondWith(networkFirstStatic(request));
  }
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data === null || typeof data !== "object") {
    return;
  }

  if (data.type === "logout") {
    // Leave nothing of a session behind on a shared device — but keep the
    // precache: the next official must still be able to boot the shell with
    // no network.
    event.waitUntil(clearRuntimeCaches());
    return;
  }

  if (data.type === "skip-waiting") {
    self.skipWaiting();
  }
});

function isAppPath(pathname) {
  // `/scorecard/v2` without the trailing slash is the same page: Django
  // redirects it, and that redirect must not be answered by another app.
  return pathname === APP_SCOPE_BARE || pathname.startsWith(APP_SCOPE);
}

async function networkFirstNavigation(request) {
  try {
    return await fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS);
  } catch (error) {
    // The static app shell is what lets the SPA mount and read IndexedDB.
    const shell = await matchPrecache(APP_SHELL_URL);
    if (shell) {
      return shell;
    }
    // Shell unavailable (its install fetch failed): the explanatory page is
    // better than a browser error.
    const offline = await matchPrecache(OFFLINE_URL);
    if (offline) {
      return offline;
    }
    return Response.error();
  }
}

async function networkFirstStatic(request) {
  let response;
  try {
    response = await fetch(request);
  } catch (error) {
    const cached =
      (await matchRuntime(request)) || (await matchPrecache(request));
    if (cached) {
      return cached;
    }
    throw error;
  }

  if (response.ok && response.type === "basic") {
    try {
      const cache = await caches.open(RUNTIME_NAME);
      await cache.put(request, response.clone());
    } catch (error) {
      // A cache write failure must never fail a good network response.
    }
  }
  return response;
}

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function matchPrecache(request) {
  // Always open our own cache: caches.match() searches every cache on the
  // origin and another app could satisfy the request.
  const cache = await caches.open(PRECACHE_NAME);
  return cache.match(request);
}

async function matchRuntime(request) {
  const cache = await caches.open(RUNTIME_NAME);
  return cache.match(request);
}

async function clearRuntimeCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(RUNTIME_PREFIX))
      .map((key) => caches.delete(key)),
  );
}
