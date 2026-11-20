"""Broadcaster mechanics: dedupe, fan-out, cleanup, cap, poll clock.

No database here: payload building and the data version are injected, so the
tests pin the fan-out behaviour rather than the query shape (which
``test_stream_queries`` covers against the real tables).
"""

import asyncio

from django.test import SimpleTestCase

from liveticker.stream.broadcaster import (
    Broadcaster,
    ClientLimitExceeded,
    StreamQuery,
    payload_version,
)


class FakeClock:
    """Sleep stand-in that lets N poll cycles run, then parks the loop."""

    def __init__(self, allow):
        self.calls = []
        self.allow = allow
        self.park = asyncio.Event()

    async def sleep(self, seconds):
        self.calls.append(seconds)
        if len(self.calls) > self.allow:
            await self.park.wait()


async def drain_ready(iterations=6):
    for _ in range(iterations):
        await asyncio.sleep(0)


def make_broadcaster(**kwargs):
    payloads = kwargs.pop("payloads", {"v": "[]"})
    state = {"payload": payloads["v"], "builds": 0, "versions": 0}

    def build(query):
        state["builds"] += 1
        return state["payload"]

    def world_version(queries):
        state["versions"] += 1
        return state["version"]

    state["version"] = "1"
    broadcaster = Broadcaster(
        payload_builder=build, world_version=world_version, **kwargs
    )
    return broadcaster, state


class BroadcasterTests(SimpleTestCase):
    async def test_subscriber_gets_the_first_snapshot_immediately(self):
        broadcaster, _ = make_broadcaster()
        query = StreamQuery.from_params(gameday="1")

        subscription = await broadcaster.subscribe(query)

        snapshot = subscription.queue.get_nowait()
        assert snapshot.data == "[]"
        assert snapshot.event_id == payload_version("[]")
        await broadcaster.aclose()

    async def test_same_query_and_payload_is_built_once_for_many_subscribers(self):
        broadcaster, state = make_broadcaster()
        query = StreamQuery.from_params(gameday="1")

        subscriptions = [await broadcaster.subscribe(query) for _ in range(50)]

        assert state["builds"] == 1
        assert broadcaster.client_count == 50
        for subscription in subscriptions:
            assert subscription.queue.get_nowait().data == "[]"
        await broadcaster.aclose()

    async def test_last_event_id_matching_the_payload_skips_the_resend(self):
        broadcaster, _ = make_broadcaster()
        query = StreamQuery.from_params(gameday="1")

        subscription = await broadcaster.subscribe(
            query, last_event_id=payload_version("[]")
        )

        assert subscription.queue.empty()
        await broadcaster.aclose()

    async def test_last_event_id_of_another_state_gets_a_snapshot(self):
        broadcaster, _ = make_broadcaster()
        query = StreamQuery.from_params(gameday="1")

        subscription = await broadcaster.subscribe(query, last_event_id="stale")

        assert subscription.queue.get_nowait().data == "[]"
        await broadcaster.aclose()

    async def test_a_changed_version_pushes_one_snapshot_per_subscriber(self):
        broadcaster, state = make_broadcaster()
        query = StreamQuery.from_params(gameday="1")
        subscriptions = [await broadcaster.subscribe(query) for _ in range(3)]
        for subscription in subscriptions:
            subscription.queue.get_nowait()

        state["payload"] = '[{"gameId": 1}]'
        await broadcaster.tick()

        for subscription in subscriptions:
            assert subscription.queue.get_nowait().data == '[{"gameId": 1}]'
        await broadcaster.aclose()

    async def test_an_unchanged_version_pushes_nothing(self):
        broadcaster, state = make_broadcaster()
        query = StreamQuery.from_params(gameday="1")
        subscription = await broadcaster.subscribe(query)
        subscription.queue.get_nowait()
        # The first tick establishes the baseline and rebuilds once (same
        # payload, so nothing is pushed); the second one must be a no-op.
        await broadcaster.tick()
        builds = state["builds"]

        await broadcaster.tick()

        assert subscription.queue.empty()
        assert state["builds"] == builds
        await broadcaster.aclose()

    async def test_distinct_queries_are_tracked_separately(self):
        broadcaster, state = make_broadcaster()
        one = StreamQuery.from_params(gameday="1")
        two = StreamQuery.from_params(gameday="2")

        first = await broadcaster.subscribe(one)
        second = await broadcaster.subscribe(two)

        assert first.queue.get_nowait().data == "[]"
        assert second.queue.get_nowait().data == "[]"
        assert state["builds"] == 2
        assert len(broadcaster.active_queries) == 2
        await broadcaster.aclose()

    async def test_last_subscriber_closes_the_idle_query(self):
        broadcaster, _ = make_broadcaster()
        query = StreamQuery.from_params(gameday="1")
        subscription = await broadcaster.subscribe(query)

        broadcaster.unsubscribe(query, subscription)

        assert broadcaster.client_count == 0
        assert broadcaster.active_queries == ()
        await broadcaster.aclose()

    async def test_unsubscribe_is_idempotent(self):
        broadcaster, _ = make_broadcaster()
        query = StreamQuery.from_params(gameday="1")
        subscription = await broadcaster.subscribe(query)

        broadcaster.unsubscribe(query, subscription)
        broadcaster.unsubscribe(query, subscription)

        assert broadcaster.client_count == 0
        await broadcaster.aclose()

    async def test_cap_refuses_another_client(self):
        broadcaster, _ = make_broadcaster(max_clients=1)
        query = StreamQuery.from_params(gameday="1")
        await broadcaster.subscribe(query)

        with self.assertRaises(ClientLimitExceeded):
            await broadcaster.subscribe(query)
        await broadcaster.aclose()

    async def test_poller_uses_the_configured_interval(self):
        clock = FakeClock(allow=2)
        broadcaster, state = make_broadcaster(poll_seconds=2.5, sleep=clock.sleep)
        subscription = await broadcaster.subscribe(StreamQuery.from_params(gameday="1"))
        subscription.queue.get_nowait()

        await asyncio.sleep(0.1)

        assert clock.calls
        assert set(clock.calls) == {2.5}
        assert state["versions"] >= 1
        await broadcaster.aclose()

    async def test_query_key_is_order_independent(self):
        one = StreamQuery.from_params(league="b,a", gameday="2,1", ticks_for="9,3")
        two = StreamQuery.from_params(league="a,b", gameday="1,2", ticks_for="3,9")

        assert one.key == two.key

    async def test_query_key_separates_results_and_ticks(self):
        base = StreamQuery.from_params(gameday="1")
        all_results = StreamQuery.from_params(gameday="1", results="all")
        ticks = StreamQuery.from_params(gameday="1", ticks_for="7")

        assert len({base.key, all_results.key, ticks.key}) == 3

    async def test_parse_int_csv_skips_invalid_parts(self):
        query = StreamQuery.from_params(gameday="1,x,2")

        assert query.gameday == (1, 2)
