/*
 * LeagueSphere Scorecard v2 service worker.
 *
 * Served by scorecard_v2.views.ServiceWorkerView from /scorecard/v2/sw.js, so
 * the scope is exactly this app. Django renders the cache version and the
 * precache list into it (see scorecard_v2/views.py — PRECACHE_ASSETS is the
 * single source of truth, tests/test_pwa.py checks every entry resolves).
 *
 * Cache policy, on purpose:
 *   - navigations: network first, offline.html when the network is gone. The
 *     app shell is login-gated, so its HTML is never stored.
 *   - /static/scorecard_v2/**: network first, cache fallback. The bundle name
 *     is fixed by vite.config.ts, so cache-first would pin a stale build.
 *   - /api/**: never touched. The outbox owns match data, not the worker.
 *   - non-GET: not intercepted.
 */

const CACHE_PREFIX = "scorecard-v2-";
const CACHE_VERSION = "{{ cache_version }}";
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

const APP_SCOPE = "{{ app_scope }}";
const STATIC_PREFIX = "{{ static_prefix }}";
const OFFLINE_URL = "{{ offline_url }}";
const PRECACHE_URLS = {{ precache_urls|safe }};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // addAll is all-or-nothing: a missing asset fails the install instead of
      // leaving a half-offline app behind.
      await cache.addAll(PRECACHE_URLS);
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
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
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
    if (url.pathname.startsWith(APP_SCOPE)) {
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
    // Leave nothing of a session behind on a shared device.
    event.waitUntil(clearCaches());
    return;
  }

  if (data.type === "skip-waiting") {
    self.skipWaiting();
  }
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    // Redirects to the login page included: pass through, never store.
    return response;
  } catch (error) {
    const offline = await caches.match(OFFLINE_URL);
    if (offline) {
      return offline;
    }
    return Response.error();
  }
}

async function networkFirstStatic(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function clearCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)),
  );
}
