"""Broadcaster mechanics: dedupe, fan-out, cleanup, cap, poll clock.

No database here: payload building and the data version are injected, so the
tests pin the fan-out behaviour rather than the query shape (which
``test_stream_queries`` covers against the real tables).
"""

import asyncio
from unittest import mock

from django.db.utils import OperationalError
from django.test import SimpleTestCase, override_settings

from liveticker.stream import broadcaster as broadcaster_module
from liveticker.stream.broadcaster import (
    STREAM_CLOSED,
    Broadcaster,
    ClientLimitExceeded,
    Snapshot,
    StreamQuery,
    payload_version,
)
from liveticker.stream.views import _events


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
    payload_builder = kwargs.pop("payload_builder", build)
    broadcaster = Broadcaster(
        payload_builder=payload_builder, world_version=world_version, **kwargs
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

    async def test_a_payload_torn_by_a_write_mid_build_is_not_pushed(self):
        """A build is several queries, so the version after it decides.

        The live shape of the tear: ``tick_count`` comes from an annotation
        read before the write, the tick rows from a query read after it, so the
        body says one tick and lists two. It differs from the previous body, so
        a broadcaster that trusts the body alone would push it as the change;
        the version recomputed after the build catches it and the next poll
        delivers the consistent body instead.
        """
        broadcaster, state = make_broadcaster()
        query = StreamQuery.from_params(gameday="1")
        subscription = await broadcaster.subscribe(query)
        subscription.queue.get_nowait()

        torn = '[{"tick_count": 1, "ticks": [1, 2]}]'
        whole = '[{"tick_count": 2, "ticks": [1, 2]}]'
        builds = []

        def building(query):
            builds.append(query.key)
            if len(builds) == 1:
                # The write commits between the build's queries: the body is
                # torn and the world version moves past the sampled one.
                state["version"] = "3"
                return torn
            return whole

        state["version"] = "2"
        broadcaster._payload_builder = building

        await broadcaster.tick()

        assert subscription.queue.empty()  # torn body dropped, not pushed
        assert broadcaster._last_world_version is None  # so the poll retries

        await broadcaster.tick()

        assert subscription.queue.get_nowait().data == whole
        assert broadcaster._last_world_version == "3"
        await broadcaster.aclose()

    async def test_a_change_whose_first_build_fails_is_not_swallowed(self):
        """The version is recorded only after its payload was accepted.

        Recording it up front made a failed build lose the change for good:
        the next poll saw the same version and returned before rebuilding.
        """
        broadcaster, state = make_broadcaster()
        query = StreamQuery.from_params(gameday="1")
        subscription = await broadcaster.subscribe(query)
        subscription.queue.get_nowait()

        def failing(query):
            raise OperationalError(2006, "MySQL server has gone away")

        state["version"] = "2"
        broadcaster._payload_builder = failing
        with self.assertRaises(OperationalError):
            await broadcaster.tick()

        state["payload"] = '[{"gameId": 1}]'
        broadcaster._payload_builder = lambda query: '[{"gameId": 1}]'
        await broadcaster.tick()

        assert subscription.queue.get_nowait().data == '[{"gameId": 1}]'
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


class OrmConnectionTests(SimpleTestCase):
    """The poller is not a request: its connection lifecycle is its own job."""

    def test_every_unit_of_work_is_wrapped_in_close_old_connections(self):
        calls = []

        def work():
            calls.append("work")
            return "result"

        with (
            mock.patch.object(
                broadcaster_module,
                "close_old_connections",
                side_effect=lambda: calls.append("close"),
            ),
            mock.patch.object(broadcaster_module, "connection") as connection,
        ):
            result = broadcaster_module._run_with_clean_connection(work)

        assert result == "result"
        assert calls == ["close", "work", "close"]
        connection.close.assert_not_called()

    def test_a_dead_connection_is_dropped_and_the_error_propagates(self):
        def work():
            raise OperationalError(2006, "MySQL server has gone away")

        with (
            mock.patch.object(broadcaster_module, "close_old_connections"),
            mock.patch.object(broadcaster_module, "connection") as connection,
        ):
            with self.assertRaises(OperationalError):
                broadcaster_module._run_with_clean_connection(work)

        # The next tick must open a fresh connection instead of reusing the
        # corpse (MySQL wait_timeout => 2006).
        connection.close.assert_called_once_with()

    def test_an_interface_error_is_dropped_too(self):
        from django.db.utils import InterfaceError

        def work():
            raise InterfaceError("connection already closed")

        with (
            mock.patch.object(broadcaster_module, "close_old_connections"),
            mock.patch.object(broadcaster_module, "connection") as connection,
        ):
            with self.assertRaises(InterfaceError):
                broadcaster_module._run_with_clean_connection(work)

        connection.close.assert_called_once_with()


class TickFailureTests(SimpleTestCase):
    async def test_a_dead_connection_on_one_tick_recovers_on_the_next(self):
        broadcaster, state = make_broadcaster()
        query = StreamQuery.from_params(gameday="1")
        subscription = await broadcaster.subscribe(query)
        subscription.queue.get_nowait()

        def dead(queries):
            raise OperationalError(2006, "MySQL server has gone away")

        broadcaster._world_version = dead
        with self.assertRaises(OperationalError):
            await broadcaster.tick()
        assert broadcaster.consecutive_failures == 1

        state["version"] = "2"
        state["payload"] = '[{"gameId": 7}]'
        broadcaster._world_version = lambda queries: "2"
        await broadcaster.tick()

        snapshot = subscription.queue.get_nowait()
        assert snapshot.data == '[{"gameId": 7}]'
        assert broadcaster.consecutive_failures == 0
        await broadcaster.aclose()

    async def test_consecutive_failures_flip_the_health_flag(self):
        broadcaster, _ = make_broadcaster(max_tick_failures=2, exit_on_failure=False)
        query = StreamQuery.from_params(gameday="1")
        await broadcaster.subscribe(query)

        def dead(queries):
            raise OperationalError(2006, "gone")

        broadcaster._world_version = dead
        with self.assertRaises(OperationalError):
            await broadcaster.tick()
        assert broadcaster.consecutive_failures == 1
        assert broadcaster.is_healthy is True

        with self.assertRaises(OperationalError):
            await broadcaster.tick()
        assert broadcaster.consecutive_failures == 2
        assert broadcaster.is_healthy is False

        broadcaster._world_version = lambda queries: "2"
        await broadcaster.tick()
        assert broadcaster.consecutive_failures == 0
        assert broadcaster.is_healthy is True
        await broadcaster.aclose()

    async def test_failures_accumulate_until_the_threshold(self):
        broadcaster, _ = make_broadcaster(max_tick_failures=10)
        await broadcaster.subscribe(StreamQuery.from_params(gameday="1"))
        broadcaster._world_version = mock.Mock(
            side_effect=OperationalError(2006, "gone")
        )

        for _ in range(3):
            with self.assertRaises(OperationalError):
                await broadcaster.tick()

        assert broadcaster.consecutive_failures == 3
        await broadcaster.aclose()


class ExitOnFailureTests(SimpleTestCase):
    """Docker restarts on exit, not on an unhealthy healthcheck."""

    def make(self, **kwargs):
        hook = mock.Mock()
        broadcaster, state = make_broadcaster(exit_hook=hook, **kwargs)
        return broadcaster, state, hook

    @staticmethod
    def dead(queries):
        raise OperationalError(2006, "MySQL server has gone away")

    async def test_reaching_the_limit_calls_the_exit_hook_exactly_once(self):
        broadcaster, _, hook = self.make(max_tick_failures=2)
        query = StreamQuery.from_params(gameday="1")
        subscription = await broadcaster.subscribe(query)
        subscription.queue.get_nowait()
        broadcaster._world_version = self.dead

        for _ in range(2):
            with self.assertRaises(OperationalError):
                await broadcaster.tick()

        assert hook.call_count == 1
        _, exception = hook.call_args.args
        assert isinstance(exception, OperationalError)
        assert broadcaster.is_healthy is False
        # Open streams end with a sentinel so uvicorn can finish shutting
        # down instead of waiting for an SSE client that never disconnects.
        assert subscription.stream_ended is True
        assert subscription.queue.get_nowait() is STREAM_CLOSED

        # The hook is a process exit in production; a mocked one must not be
        # called again on every further failure.
        with self.assertRaises(OperationalError):
            await broadcaster.tick()
        assert hook.call_count == 1
        await broadcaster.aclose()

    async def test_a_success_before_the_limit_resets_the_counter(self):
        broadcaster, _, hook = self.make(max_tick_failures=3)
        await broadcaster.subscribe(StreamQuery.from_params(gameday="1"))
        broadcaster._world_version = self.dead

        for _ in range(2):
            with self.assertRaises(OperationalError):
                await broadcaster.tick()
        assert hook.call_count == 0

        broadcaster._world_version = lambda queries: "2"
        await broadcaster.tick()
        assert broadcaster.consecutive_failures == 0

        broadcaster._world_version = self.dead
        for _ in range(2):
            with self.assertRaises(OperationalError):
                await broadcaster.tick()
        assert hook.call_count == 0
        await broadcaster.aclose()

    async def test_the_switch_off_never_calls_the_hook(self):
        broadcaster, _, hook = self.make(max_tick_failures=1, exit_on_failure=False)
        await broadcaster.subscribe(StreamQuery.from_params(gameday="1"))
        broadcaster._world_version = self.dead

        with self.assertRaises(OperationalError):
            await broadcaster.tick()

        assert broadcaster.consecutive_failures == 1
        assert hook.call_count == 0
        await broadcaster.aclose()

    async def test_no_exit_before_the_first_tick_ever_ran(self):
        # A failing initial payload build is a request error, not a poll
        # failure: a worker that has never ticked must not kill itself.
        def broken(query):
            raise OperationalError(2006, "gone")

        hook = mock.Mock()
        broadcaster, _ = make_broadcaster(
            payload_builder=broken,
            max_tick_failures=1,
            exit_hook=hook,
        )

        with self.assertRaises(OperationalError):
            await broadcaster.subscribe(StreamQuery.from_params(gameday="1"))

        assert hook.call_count == 0
        assert broadcaster.consecutive_failures == 0
        assert broadcaster.client_count == 0
        await broadcaster.aclose()

    @override_settings(LIVETICKER_STREAM_EXIT_ON_FAILURE=False)
    async def test_the_default_reads_the_setting(self):
        broadcaster, _ = make_broadcaster(max_tick_failures=1, exit_hook=mock.Mock())
        assert broadcaster.exit_on_failure is False
        await broadcaster.aclose()


class StreamShutdownTests(SimpleTestCase):
    async def test_the_event_generator_ends_and_unsubscribes_on_the_sentinel(self):
        broadcaster, _ = make_broadcaster()
        query = StreamQuery.from_params(gameday="1")
        subscription = await broadcaster.subscribe(query)
        subscription.queue.get_nowait()
        broadcaster.close_streams()

        frames = []
        async for frame in _events(subscription, query, broadcaster, 5.0):
            frames.append(frame)

        assert frames == []
        assert broadcaster.client_count == 0
        assert broadcaster.active_queries == ()
        await broadcaster.aclose()

    async def test_a_closed_subscription_ignores_later_snapshots(self):
        broadcaster, _ = make_broadcaster()
        subscription = await broadcaster.subscribe(StreamQuery.from_params(gameday="1"))
        subscription.queue.get_nowait()

        subscription.close()
        subscription.offer(Snapshot("v9", "[9]"))

        assert subscription.queue.get_nowait() is STREAM_CLOSED
        await broadcaster.aclose()


class LatestWinsQueueTests(SimpleTestCase):
    async def test_a_paused_consumer_receives_only_the_latest_snapshot(self):
        broadcaster, _ = make_broadcaster()
        subscription = await broadcaster.subscribe(StreamQuery.from_params(gameday="1"))
        subscription.queue.get_nowait()  # consume the initial snapshot

        for index in range(3):
            subscription.offer(Snapshot(f"v{index}", f"[{index}]"))

        assert subscription.queue.qsize() == 1
        latest = await subscription.queue.get()
        assert latest.data == "[2]"
        assert latest.event_id == "v2"
        await broadcaster.aclose()

    async def test_a_fast_consumer_still_gets_every_snapshot(self):
        broadcaster, _ = make_broadcaster()
        subscription = await broadcaster.subscribe(StreamQuery.from_params(gameday="1"))
        subscription.queue.get_nowait()

        subscription.offer(Snapshot("a", "[0]"))
        assert (await subscription.queue.get()).data == "[0]"
        subscription.offer(Snapshot("b", "[1]"))
        assert (await subscription.queue.get()).data == "[1]"
        await broadcaster.aclose()
