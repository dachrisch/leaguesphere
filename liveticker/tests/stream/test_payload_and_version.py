"""Stream-side guarantees: payload equality, version freshness, query budget."""

import datetime
import json

from django.db import connection
from django.test import TestCase, TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from liveticker.api.urls import API_LIVETICKER_ALL
from liveticker.stream.broadcaster import (
    Broadcaster,
    StreamQuery,
    build_payload,
    compute_world_version,
)
from liveticker.service.version import liveticker_version
from liveticker.tests.stream.fixture import make_ticker_fixture


class StreamPayloadTests(TestCase):
    def setUp(self):
        self.fixture = make_ticker_fixture()

    def test_stream_payload_is_the_get_payload_for_the_same_query(self):
        params = {"results": "all", "gameday": str(self.fixture["gameday"].pk)}
        response = self.client.get(reverse(API_LIVETICKER_ALL), params)
        assert response.status_code == 200

        payload = build_payload(
            StreamQuery.from_params(
                results=params["results"], gameday=params["gameday"]
            )
        )

        assert json.loads(payload) == response.json()

    def test_stream_payload_follows_the_expanded_game_parameter(self):
        game_id = self.fixture["game"].pk
        params = {"results": "all", "getAllTicksFor": str(game_id)}
        response = self.client.get(reverse(API_LIVETICKER_ALL), params)

        payload = build_payload(
            StreamQuery.from_params(results="all", ticks_for=str(game_id))
        )

        assert json.loads(payload) == response.json()


class LivetickerVersionTests(TestCase):
    def setUp(self):
        self.fixture = make_ticker_fixture()

    def test_etag_is_the_shared_version(self):
        gameday_id = self.fixture["gameday"].pk
        response = self.client.get(
            reverse(API_LIVETICKER_ALL), {"gameday": str(gameday_id)}
        )
        version, gameday_ids = liveticker_version(
            "gameday=" + str(gameday_id), [], [gameday_id]
        )

        assert response["ETag"] == version
        assert gameday_ids == [self.fixture["gameday"].pk]

    def test_a_new_tick_changes_the_version(self):
        before, _ = liveticker_version("q", [], [self.fixture["gameday"].pk])

        from gamedays.models import TeamLog

        TeamLog.objects.create(
            gameinfo=self.fixture["game"],
            team=self.fixture["home"],
            sequence=2,
            player=9,
            event="Run",
            input="",
            value=0,
            half=1,
            created_time=datetime.time(11, 30),
            author=self.fixture["author"],
        )
        after, _ = liveticker_version("q", [], [self.fixture["gameday"].pk])

        assert before != after

    def test_editing_a_game_changes_the_version(self):
        before, _ = liveticker_version("q", [], [self.fixture["gameday"].pk])

        game = self.fixture["game"]
        game.status = "2. Halbzeit"
        game.save(update_fields=["status", "updated_at"])
        after, _ = liveticker_version("q", [], [self.fixture["gameday"].pk])

        assert before != after


class StreamQueryBudgetTests(TransactionTestCase):
    """The poller's cost follows queries, never subscribers."""

    def setUp(self):
        self.fixture = make_ticker_fixture()

    async def test_fifty_subscribers_cost_the_same_queries_per_tick(self):
        fixture = self.fixture
        counts = []
        builds = []

        def counting_world_version(queries):
            with CaptureQueriesContext(connection) as captured:
                value = compute_world_version(queries)
            counts.append(len(captured))
            return value

        def counting_payload(query):
            builds.append(query.key)
            return build_payload(query)

        broadcaster = Broadcaster(
            poll_seconds=60,
            world_version=counting_world_version,
            payload_builder=counting_payload,
        )
        query = StreamQuery.from_params(gameday=str(fixture["gameday"].pk))
        first = await broadcaster.subscribe(query)
        await broadcaster.tick()
        queries_for_one_subscriber = counts[-1]
        builds_for_one_subscriber = len(builds)

        others = [await broadcaster.subscribe(query) for _ in range(49)]
        await broadcaster.tick()

        assert queries_for_one_subscriber == counts[-1]
        assert len(builds) == builds_for_one_subscriber
        assert broadcaster.client_count == 50
        assert len(first.queue._queue) == 1  # its initial snapshot
        for subscription in others:
            assert len(subscription.queue._queue) == 1  # initial snapshot only
        await broadcaster.aclose()
