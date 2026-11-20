"""The SSE endpoint over the ASGI handler: frames, changes, heartbeat, cap."""

import asyncio
import datetime
import json

from asgiref.sync import sync_to_async
from django.test import TransactionTestCase, override_settings
from django.urls import reverse

from gamedays.models import TeamLog
from liveticker.api.urls import API_LIVETICKER_STREAM
from liveticker.stream.broadcaster import get_broadcaster
from liveticker.tests.stream.fixture import make_ticker_fixture

STREAM_SETTINGS = dict(
    LIVETICKER_STREAM_ENABLED=True,
    LIVETICKER_STREAM_POLL_SECONDS=0.02,
    LIVETICKER_STREAM_HEARTBEAT_SECONDS=0.05,
)


async def next_frame(response, timeout=2.0):
    chunk = await asyncio.wait_for(
        response.streaming_content.__aiter__().__anext__(), timeout
    )
    # The ASGI handler encodes the view's text frames to bytes.
    return chunk.decode() if isinstance(chunk, bytes) else chunk


async def next_snapshot(response, timeout=2.0):
    """Skip heartbeat comments until a snapshot frame arrives."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while True:
        remaining = deadline - loop.time()
        if remaining <= 0:
            raise TimeoutError("no snapshot frame before the timeout")
        frame = await next_frame(response, remaining)
        if frame.startswith("id:"):
            return frame


def parse_snapshot(frame):
    event_id = None
    event = None
    data = []
    for line in frame.splitlines():
        if line.startswith("id: "):
            event_id = line[4:]
        elif line.startswith("event: "):
            event = line[7:]
        elif line.startswith("data: "):
            data.append(line[6:])
    return event_id, event, json.loads("\n".join(data))


@override_settings(**STREAM_SETTINGS)
class LivetickerStreamViewTests(TransactionTestCase):
    def setUp(self):
        self.fixture = make_ticker_fixture()
        self.url = reverse(API_LIVETICKER_STREAM)

    async def test_first_frame_is_the_current_snapshot(self):
        response = await self.async_client.get(self.url)

        assert response.status_code == 200
        assert response["Content-Type"] == "text/event-stream"
        assert response["Cache-Control"] == "no-cache"
        assert response["X-Accel-Buffering"] == "no"

        event_id, event, data = parse_snapshot(await next_frame(response))
        assert event
        assert event == "snapshot"
        assert event_id
        assert data[0]["gameId"] == self.fixture["game"].pk
        await response.streaming_content.aclose()

    async def test_a_change_arrives_as_a_new_snapshot_without_polling(self):
        response = await self.async_client.get(self.url)
        first_id, _, first = parse_snapshot(await next_frame(response))

        # A new tick, the same write path the scorecard uses.
        await sync_to_async(TeamLog.objects.create)(
            gameinfo=self.fixture["game"],
            team=self.fixture["home"],
            sequence=2,
            player=9,
            event="Touchdown",
            input="12 Yards",
            value=6,
            half=1,
            created_time=datetime.time(11, 20),
            author=self.fixture["author"],
        )

        second_id, event, second = parse_snapshot(await next_snapshot(response))
        assert event == "snapshot"
        assert second_id != first_id
        assert second[0]["tick_count"] > first[0]["tick_count"]
        await response.streaming_content.aclose()

    async def test_heartbeat_is_a_comment_frame(self):
        response = await self.async_client.get(self.url)
        await next_frame(response)

        frame = await next_frame(response, timeout=1.0)

        assert frame == ": ping\n\n"
        await response.streaming_content.aclose()

    async def test_last_event_id_of_the_current_version_is_not_resent(self):
        response = await self.async_client.get(self.url)
        event_id, _, _ = parse_snapshot(await next_frame(response))
        await response.streaming_content.aclose()

        reconnect = await self.async_client.get(
            self.url, headers={"Last-Event-ID": event_id}
        )

        # Nothing to resend: the next frame is the heartbeat comment.
        assert await next_frame(reconnect, timeout=1.0) == ": ping\n\n"
        await reconnect.streaming_content.aclose()

    async def test_disconnect_releases_the_subscription(self):
        response = await self.async_client.get(self.url)
        await next_frame(response)

        # Close the test client's iterator wrapper, which runs the response's
        # close path exactly as a disconnect does; the scheduled generator
        # close then releases the subscription.
        await response._iterator.aclose()
        await asyncio.sleep(0)

        broadcaster = get_broadcaster()
        assert broadcaster.client_count == 0
        assert broadcaster.active_queries == ()

    async def test_flag_off_answers_404(self):
        with override_settings(LIVETICKER_STREAM_ENABLED=False):
            response = await self.async_client.get(self.url)

        assert response.status_code == 404

    async def test_non_get_is_rejected(self):
        response = await self.async_client.post(self.url)

        assert response.status_code == 405


@override_settings(**STREAM_SETTINGS)
class LivetickerStreamCapTests(TransactionTestCase):
    async def test_cap_answers_503_with_retry_after(self):
        with override_settings(
            LIVETICKER_STREAM_MAX_CLIENTS=0,
            LIVETICKER_STREAM_RETRY_AFTER_SECONDS=7,
        ):
            response = await self.async_client.get(reverse(API_LIVETICKER_STREAM))

        assert response.status_code == 503
        assert response["Retry-After"] == "7"
