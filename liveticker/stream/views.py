"""Server-Sent-Events endpoint for the liveticker.

Served by the separate ASGI worker (``league_manager.asgi``); a long-lived
response must not hold one of the WSGI app's few gunicorn request slots.
"""

import asyncio

from django.conf import settings
from django.http import Http404, HttpResponse, HttpResponseNotAllowed, JsonResponse
from django.http import StreamingHttpResponse

from liveticker.stream.broadcaster import (
    ClientLimitExceeded,
    StreamQuery,
    get_broadcaster,
)

SSE_CONTENT_TYPE = "text/event-stream"


class EventStreamResponse(StreamingHttpResponse):
    """An SSE response that deterministically releases its subscription.

    ``StreamingHttpResponse.__aiter__`` forwards chunks from the async
    generator it wraps, but the ASGI handler closes only that forwarding
    generator. Without the explicit close below, an aborted client's
    subscription would stay in the broadcaster's queue until a garbage
    collection pass, receiving snapshots nobody reads.
    """

    def __init__(self, events, **kwargs):
        self.events = events
        super().__init__(events, **kwargs)

    async def __aiter__(self):
        try:
            async for part in super().__aiter__():
                yield part
        finally:
            if not self.events.ag_running:
                await self.events.aclose()

    def close(self):
        events = self.events
        if not events.ag_running:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                asyncio.run(events.aclose())
            else:
                loop.create_task(events.aclose())
        super().close()


async def liveticker_stream_health(request):
    """Health probe for the stream worker itself.

    ``/health/`` answers for the site (maintenance mode, DB reachability via
    the app), but cannot tell whether this process' poller is still delivering
    snapshots. The compose healthcheck polls this instead, so a stream worker
    whose ticks have been failing since MySQL killed the idle connection is
    restarted rather than silently serving stale data to clients that still
    show "Live".
    """
    broadcaster = get_broadcaster()
    healthy = broadcaster.is_healthy
    body = {
        "status": "healthy" if healthy else "unhealthy",
        "clients": broadcaster.client_count,
        "queries": len(broadcaster.active_queries),
        "consecutive_tick_failures": broadcaster.consecutive_failures,
        "max_tick_failures": broadcaster.max_tick_failures,
    }
    return JsonResponse(body, status=200 if healthy else 503)


def sse_frame(snapshot):
    """One SSE message; every line of a JSON body gets its own ``data:``."""
    lines = snapshot.data.splitlines() or [""]
    body = "\n".join(f"data: {line}" for line in lines)
    return f"id: {snapshot.event_id}\nevent: snapshot\n{body}\n\n"


async def _events(subscription, query, broadcaster, heartbeat_seconds):
    try:
        while True:
            try:
                snapshot = await asyncio.wait_for(
                    subscription.queue.get(), timeout=heartbeat_seconds
                )
            except asyncio.TimeoutError:
                # Comment line: ignored by EventSource, but it keeps proxies
                # and load balancers from closing an idle connection.
                yield ": ping\n\n"
                continue
            yield sse_frame(snapshot)
    finally:
        broadcaster.unsubscribe(query, subscription)


async def liveticker_stream(request):
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])
    if not getattr(settings, "LIVETICKER_STREAM_ENABLED", False):
        raise Http404

    query = StreamQuery.from_params(
        league=request.GET.get("league", ""),
        gameday=request.GET.get("gameday", ""),
        results=request.GET.get("results", ""),
        ticks_for=request.GET.get("getAllTicksFor", ""),
    )
    broadcaster = get_broadcaster()
    try:
        subscription = await broadcaster.subscribe(
            query, last_event_id=request.headers.get("Last-Event-ID")
        )
    except ClientLimitExceeded:
        # Beyond the per-process cap the client falls back to polling instead
        # of piling another long-lived connection onto a full worker.
        response = HttpResponse(status=503)
        response["Retry-After"] = str(
            getattr(settings, "LIVETICKER_STREAM_RETRY_AFTER_SECONDS", 5)
        )
        return response

    response = EventStreamResponse(
        _events(
            subscription,
            query,
            broadcaster,
            float(getattr(settings, "LIVETICKER_STREAM_HEARTBEAT_SECONDS", 15.0)),
        ),
        content_type=SSE_CONTENT_TYPE,
    )
    response["Cache-Control"] = "no-cache"
    # nginx must not buffer: otherwise the snapshot arrives only when the
    # buffer fills, which for a quiet ticker is never.
    response["X-Accel-Buffering"] = "no"
    return response
