from django.core.cache import cache

# Matches the horizon used elsewhere for computed/cached payloads (see
# MAINTENANCE_CONFIG_CACHE_TTL and the db_connection_status cache) - long
# enough to absorb a burst of concurrent requests for the same etag, short
# enough that a stale entry left behind by a cache key collision self-heals
# quickly.
CACHE_TIMEOUT_SECONDS = 3600

_CACHE_KEY_PREFIX = "etag-payload"


def get_or_compute_by_etag(etag: str, compute):
    """Share one computed payload across every request for the same etag.

    An HTTP-level ETag (django.views.decorators.http.condition) already lets
    a *returning* client with a matching If-None-Match skip the view body
    via a 304 - but every other request (a client's first visit, or any
    client that doesn't send If-None-Match, which is most non-browser API
    callers) still recomputes the full response from scratch even though
    the underlying data - and therefore the correct response - is identical
    for everyone until the etag changes. This caches that computed payload
    server-side, keyed by the etag string the view's own etag_func already
    computes, so the expensive work happens once per data change rather
    than once per request.

    Only useful with a cache shared across all worker processes (Redis, not
    the per-worker LocMemCache dev/test use) - see league_manager/settings/
    base.py's CACHES setting.
    """
    cache_key = f"{_CACHE_KEY_PREFIX}:{etag}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    result = compute()
    cache.set(cache_key, result, CACHE_TIMEOUT_SECONDS)
    return result
