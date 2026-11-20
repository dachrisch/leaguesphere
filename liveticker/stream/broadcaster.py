"""In-process fan-out for the liveticker Server-Sent-Events endpoint.

Design: one poller per process, one shared payload per distinct query.

No Redis, because a Redis client would still need the deploy to grow another
service, and the stream process is deliberately a single ASGI worker: the only
fan-out that has to cross a process boundary is "two workers", which this
deployment does not have. The poller asks the same aggregate question as the
JSON endpoint's ETag (``liveticker.service.version``), scoped to the gamedays
the active queries watch, so a quiet gameday costs four flat aggregate queries
per second no matter how many browsers are connected. Payloads are rebuilt
only when that version changes, once per distinct query -- never per client.
"""

import asyncio
import hashlib
import logging
import weakref
from dataclasses import dataclass

# ``thread_sensitive=False`` on purpose: the poller is a background task, not
# part of a request. asgiref's thread-sensitive executor is bound to the call
# that entered the loop (and is torn down with it), so a task that outlives
# that call fails with "CurrentThreadExecutor already quit or is broken". Each
# call also touches the ORM, which gets its own per-thread connection in the
# loop's default executor either way.
from asgiref.sync import sync_to_async
from django.conf import settings
from rest_framework.renderers import JSONRenderer

from liveticker.service.liveticker_service import (
    LivetickerService,
    resolve_gameday_ids,
)
from liveticker.service.version import liveticker_version

logger = logging.getLogger(__name__)


class ClientLimitExceeded(Exception):
    """Too many open streams in this process; the client should poll."""


def parse_int_csv(input_value):
    """Comma separated ints; invalid parts are skipped (API semantics)."""
    numbers = []
    for part in (input_value or "").split(","):
        try:
            numbers.append(int(part))
        except ValueError:
            continue
    return numbers


@dataclass(frozen=True)
class StreamQuery:
    """The query semantics of ``GET /api/liveticker/`` in canonical form."""

    league: tuple = ()
    gameday: tuple = ()
    all_results: bool = False
    ticks_for: tuple = ()

    @classmethod
    def from_params(cls, league="", gameday="", results="", ticks_for=""):
        return cls(
            league=tuple(sorted({slug for slug in league.split(",") if slug})),
            gameday=tuple(sorted(set(parse_int_csv(gameday)))),
            all_results=results == "all",
            ticks_for=tuple(sorted(set(parse_int_csv(ticks_for)))),
        )

    @property
    def key(self):
        """Stable identity: two clients asking the same thing share a payload."""
        return "|".join(
            (
                "league=" + ",".join(self.league),
                "gameday=" + ",".join(str(gameday) for gameday in self.gameday),
                "results=" + ("all" if self.all_results else "default"),
                "ticks=" + ",".join(str(game) for game in self.ticks_for),
            )
        )


@dataclass(frozen=True)
class Snapshot:
    event_id: str
    data: str


class Subscription:
    """One connected client's mailbox."""

    def __init__(self):
        self.queue: asyncio.Queue = asyncio.Queue()
        self.closed = False


class _ActiveQuery:
    def __init__(self, query):
        self.query = query
        self.subscribers = set()
        self.version = None
        self.payload = None
        self.lock = asyncio.Lock()


def payload_version(payload):
    """Event id of a payload; equal payload means equal id.

    Derived from the rendered body rather than from a second version query:
    the id and the bytes it labels then always describe the same state, which
    is what ``Last-Event-ID`` is compared against.
    """
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


def build_payload(query):
    """The exact JSON body ``GET /api/liveticker/`` would return."""
    service = LivetickerService(
        list(query.league),
        list(query.ticks_for),
        list(query.gameday),
        all_results=query.all_results,
    )
    return JSONRenderer().render(service.get_liveticker_as_json()).decode("utf-8")


def compute_world_version(queries):
    """Cheap version over every gameday the active queries watch.

    Each query's own filter is resolved first (an unfiltered ticker follows
    today's gamedays), then one aggregate pass covers the union. The
    aggregates are the ETag's, not a second copy of them.
    """
    gameday_ids = set()
    for query in queries:
        gameday_ids.update(resolve_gameday_ids(list(query.gameday), list(query.league)))
    version, _ = liveticker_version("stream", [], sorted(gameday_ids))
    return version


class Broadcaster:
    def __init__(
        self,
        *,
        poll_seconds=None,
        max_clients=None,
        payload_builder=build_payload,
        world_version=compute_world_version,
        sleep=asyncio.sleep,
    ):
        self.poll_seconds = (
            float(getattr(settings, "LIVETICKER_STREAM_POLL_SECONDS", 1.0))
            if poll_seconds is None
            else poll_seconds
        )
        self.max_clients = (
            int(getattr(settings, "LIVETICKER_STREAM_MAX_CLIENTS", 2000))
            if max_clients is None
            else max_clients
        )
        self._payload_builder = payload_builder
        self._world_version = world_version
        self._sleep = sleep
        self._queries = {}
        self._clients = 0
        self._last_world_version = None
        self._task = None

    # -- subscriptions ----------------------------------------------------

    async def subscribe(self, query, last_event_id=None):
        if self._clients >= self.max_clients:
            raise ClientLimitExceeded
        active = self._queries.get(query.key)
        if active is None:
            active = _ActiveQuery(query)
            self._queries[query.key] = active

        subscription = Subscription()
        active.subscribers.add(subscription)
        self._clients += 1
        self._start_poller()
        try:
            await self._ensure_payload(active)
        except BaseException:
            self.unsubscribe(active.query, subscription)
            raise

        # A reconnecting client that already holds this exact payload (same
        # Last-Event-ID) has nothing to resend: it keeps its state and waits
        # for the next change or heartbeat.
        if last_event_id != active.version:
            subscription.queue.put_nowait(Snapshot(active.version, active.payload))
        return subscription

    def unsubscribe(self, query, subscription):
        if subscription.closed:
            return
        subscription.closed = True
        self._clients -= 1
        active = self._queries.get(query.key)
        if active is None:
            return
        active.subscribers.discard(subscription)
        if not active.subscribers:
            # Idle queries are closed with their last subscriber: a query with
            # no readers must not make the poller keep computing it.
            del self._queries[query.key]
        if not self._queries:
            self._stop_poller()

    # -- one poll cycle ---------------------------------------------------

    async def tick(self):
        queries = list(self._queries.values())
        if not queries:
            return
        version = await sync_to_async(self._world_version, thread_sensitive=False)(
            [q.query for q in queries]
        )
        if version == self._last_world_version:
            return
        self._last_world_version = version
        for active in queries:
            async with active.lock:
                payload = await sync_to_async(
                    self._payload_builder, thread_sensitive=False
                )(active.query)
                event_id = payload_version(payload)
                if event_id == active.version:
                    continue
                active.version = event_id
                active.payload = payload
            for subscription in list(active.subscribers):
                subscription.queue.put_nowait(Snapshot(event_id, payload))

    async def _ensure_payload(self, active):
        async with active.lock:
            if active.version is not None:
                return
            payload = await sync_to_async(
                self._payload_builder, thread_sensitive=False
            )(active.query)
            active.version = payload_version(payload)
            active.payload = payload

    async def _run(self):
        while True:
            await self._sleep(self.poll_seconds)
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception:  # pragma: no cover - defensive, logged below
                logger.exception("liveticker stream poll failed")

    def _start_poller(self):
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    def _stop_poller(self):
        if self._task is not None:
            self._task.cancel()
            self._task = None

    async def aclose(self):
        task = self._task
        self._task = None
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    # -- introspection (tests, health) ------------------------------------

    @property
    def client_count(self):
        return self._clients

    @property
    def active_queries(self):
        return tuple(self._queries.values())


# One broadcaster per event loop: the production process has exactly one, while
# tests get an isolated instance per loop. ``WeakKeyDictionary`` drops the entry
# when a test loop is collected.
_broadcasters = weakref.WeakKeyDictionary()


def get_broadcaster():
    loop = asyncio.get_running_loop()
    broadcaster = _broadcasters.get(loop)
    if broadcaster is None:
        broadcaster = Broadcaster()
        _broadcasters[loop] = broadcaster
    return broadcaster


def reset_broadcaster():
    """Test hook: forget the broadcaster bound to the current loop."""
    loop = asyncio.get_running_loop()
    _broadcasters.pop(loop, None)
