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
import os
import signal
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
from django.db import close_old_connections, connection
from django.db.utils import InterfaceError, OperationalError
from rest_framework.renderers import JSONRenderer

from liveticker.service.liveticker_service import (
    LivetickerService,
    resolve_gameday_ids,
)
from liveticker.service.version import liveticker_version

logger = logging.getLogger(__name__)

# A connection error means the socket is unusable (the classic case is MySQL's
# ``wait_timeout`` giving 2006 "server has gone away" after an idle night).
DEAD_CONNECTION_ERRORS = (OperationalError, InterfaceError)


def terminate_worker(failures, exc):
    """End this worker process so a fresh one starts with fresh connections.

    Chosen mechanism: signal the **worker** (our own PID) with SIGTERM. With
    ``gunicorn -w 1 -k uvicorn.workers.UvicornWorker`` the gunicorn master
    respawns an exited worker automatically, so the process that owns the
    stuck poller is replaced without touching the master or Docker. SIGTERM is
    gunicorn's graceful shutdown: uvicorn's worker closes the open SSE
    responses, so clients reconnect with ``Last-Event-ID`` instead of hanging
    on a half-dead stream. Killing the master would restart the whole service
    (and its port binding) for the same effect; exiting the worker is the
    smaller hammer and also works if the container ever runs a bare uvicorn.

    Crash-loop guard: if the database is down, each replacement worker fails
    again after ``LIVETICKER_STREAM_MAX_TICK_FAILURES`` ticks (10 s at the
    default poll, longer with a larger poll interval). That is bounded and
    visible in the logs; Docker's restart policy is the outer bound when the
    master itself dies.
    """
    logger.error(
        "liveticker stream poller failed %d times in a row (%s); exiting the "
        "worker so gunicorn restarts it with fresh DB connections",
        failures,
        exc,
        exc_info=exc,
    )
    os.kill(os.getpid(), signal.SIGTERM)


def _run_with_clean_connection(func, *args):
    """Run ORM work and manage the executor thread's DB connection.

    The poller is not a request, so Django never emits request_started/
    request_finished for it and never returns the thread's connection to
    ``CONN_MAX_AGE``. Closing old connections before and after each unit of
    work is what makes the age/error checks run at all. On a dead connection
    the socket is dropped explicitly, so the next tick reconnects instead of
    reusing the corpse forever.
    """
    close_old_connections()
    try:
        return func(*args)
    except DEAD_CONNECTION_ERRORS:
        close_old_connections()
        connection.close()
        raise
    finally:
        close_old_connections()


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


# Queue sentinel: the worker is shutting down, finish this response so the
# client reconnects (with Last-Event-ID) to the replacement worker.
STREAM_CLOSED = object()


class Subscription:
    """One connected client's mailbox.

    Latest-wins: a slow client is only ever behind by the newest state, not by
    a backlog. The queue holds at most one snapshot; offering a newer one
    drops the unread older one.
    """

    def __init__(self):
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=1)
        # Two different lifetimes: ``stream_ended`` means the sentinel is
        # queued (the response is finishing), ``closed`` means the subscriber
        # was removed. Overloading one flag made the final unsubscribe a no-op.
        self.closed = False
        self.stream_ended = False

    def offer(self, snapshot):
        if self.stream_ended:
            # A finishing stream must not get its sentinel overwritten by a
            # snapshot from a still-running poller.
            return
        self._replace(snapshot)

    def close(self):
        if self.stream_ended:
            return
        self.stream_ended = True
        self._replace(STREAM_CLOSED)

    def _replace(self, item):
        while True:
            try:
                self.queue.put_nowait(item)
                return
            except asyncio.QueueFull:
                try:
                    self.queue.get_nowait()
                except asyncio.QueueEmpty:  # pragma: no cover - consumer race
                    continue


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
        max_tick_failures=None,
        exit_on_failure=None,
        exit_hook=terminate_worker,
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
        self.max_tick_failures = (
            int(getattr(settings, "LIVETICKER_STREAM_MAX_TICK_FAILURES", 10))
            if max_tick_failures is None
            else max_tick_failures
        )
        self.exit_on_failure = (
            bool(getattr(settings, "LIVETICKER_STREAM_EXIT_ON_FAILURE", True))
            if exit_on_failure is None
            else exit_on_failure
        )
        self._exit_hook = exit_hook
        self._payload_builder = payload_builder
        self._world_version = world_version
        self._sleep = sleep
        self._queries = {}
        self._clients = 0
        self._last_world_version = None
        self._consecutive_failures = 0
        self._ticks_attempted = 0
        self._exit_requested = False
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
            subscription.offer(Snapshot(active.version, active.payload))
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

    async def _in_thread(self, func, *args):
        """Run one unit of ORM work through the connection-managing helper."""
        return await sync_to_async(_run_with_clean_connection, thread_sensitive=False)(
            func, *args
        )

    async def tick(self):
        self._ticks_attempted += 1
        try:
            await self._tick()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            # Counted for the health check and the exit decision: a stream
            # that cannot refresh is serving stale data while every client
            # still looks "live".
            self._consecutive_failures += 1
            self._handle_tick_failure(exc)
            raise
        else:
            self._consecutive_failures = 0

    def _handle_tick_failure(self, exc):
        if not self.exit_on_failure or self._exit_requested:
            return
        if self._ticks_attempted == 0:
            # Never kill a worker that has not polled yet: an initial payload
            # failure is a request error, not a stuck poller.
            return
        if self._consecutive_failures < self.max_tick_failures:
            return
        self._exit_requested = True
        # End the open responses first: SIGTERM alone leaves uvicorn waiting
        # for long-lived SSE connections that only end when the client gives
        # up. A sentinel per subscriber finishes each response immediately.
        self.close_streams()
        self._exit_hook(self._consecutive_failures, exc)

    def close_streams(self):
        for active in list(self._queries.values()):
            for subscription in list(active.subscribers):
                subscription.close()

    async def _tick(self):
        queries = list(self._queries.values())
        if not queries:
            return
        watched = [q.query for q in queries]
        version = await self._in_thread(self._world_version, watched)
        if version == self._last_world_version:
            return
        for active in queries:
            async with active.lock:
                payload = await self._in_thread(self._payload_builder, active.query)
                event_id = payload_version(payload)
                if event_id == active.version:
                    continue
                # The build is a handful of queries, not one consistent read: a
                # write that commits while it runs can tear the body in half (a
                # ``tick_count`` annotation read before the write next to the
                # tick rows read after it), and a torn body differs from the
                # last one, so it would be pushed as the change. Only publish a
                # body the version still describes; otherwise record nothing and
                # let the next poll rebuild -- the tick that arrives a poll late
                # is correct, the one published torn is not.
                if await self._in_thread(self._world_version, watched) != version:
                    return
                active.version = event_id
                active.payload = payload
            for subscription in list(active.subscribers):
                subscription.offer(Snapshot(event_id, payload))
        # Recorded only once every payload of this version was accepted, so a
        # failed or torn tick is retried instead of swallowing the change.
        self._last_world_version = version

    async def _ensure_payload(self, active):
        async with active.lock:
            if active.version is not None:
                return
            payload = await self._in_thread(self._payload_builder, active.query)
            active.version = payload_version(payload)
            active.payload = payload

    async def _run(self):
        while not self._exit_requested:
            await self._sleep(self.poll_seconds)
            if self._exit_requested:
                return
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
    def consecutive_failures(self):
        return self._consecutive_failures

    @property
    def is_healthy(self):
        return self._consecutive_failures < self.max_tick_failures

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
