"""S01–S07 and S16 — one phone keeps its data.

The runs cover the queue drained in order, an offline reload, a hard kill with
a queue, a lost answer (replay must not duplicate), and a signal that drops
halfway through a drain. Everything ends in ``assert_invariants``; a failure
there names the invariant, not a selector.
"""

import time

import pytest

from scorecard_v2.tests.e2e_scenarios.harness import (
    PASSWORD,
    USERNAME,
    assert_invariants,
    server_state,
    started_game,
)

pytestmark = pytest.mark.django_db(transaction=True)


def test_s01_offline_entries_drain_in_order(phones, club_game, report):
    a, _ = phones
    started_game(a, club_game)
    baseline = len(server_state(club_game).events)

    a.offline()
    for _ in range(5):
        a.tap_turnover()

    queued = a.queue()
    report.observe("S01", "queued", [(op.kind, op.seq) for op in queued])
    assert len(queued) == 10, "each turnover queues the entry and its possession flip"
    assert len(server_state(club_game).events) == baseline

    a.online()
    a.wait_queue(0)

    state = server_state(club_game)
    seqs = [event.seq for event in state.events]
    report.observe("S01", "server_events", len(state.events))
    report.observe("S01", "seq_order", seqs)
    assert seqs == sorted(seqs)
    assert len(state.events) > baseline
    assert_invariants(club_game, [a], {op.id for op in queued})


def test_s02_offline_reload_keeps_the_queue(phones, club_game, report):
    a, _ = phones
    started_game(a, club_game)

    a.offline()
    for _ in range(3):
        a.tap_turnover()
    queued = a.queue()
    ids = {op.id for op in queued}

    a.reload()
    a.wait_tracking()
    after = a.queue()
    report.observe("S02", "ids_before", sorted(ids))
    report.observe("S02", "ids_after", sorted(op.id for op in after))
    assert {op.id for op in after} == ids
    assert len(after) == len(queued)

    a.online()
    a.wait_queue(0)
    assert_invariants(club_game, [a], ids)


def test_s03_killed_phone_delivers_after_restart(phones, club_game, report):
    a, _ = phones
    started_game(a, club_game)

    a.offline()
    for _ in range(3):
        a.tap_turnover()
    queued = {op.id for op in a.queue()}

    a.kill()
    assert a.pids() == []
    a.restart()
    a.open_game(club_game)
    a.wait_tracking()
    a.wait_queue(0)

    state = server_state(club_game)
    report.observe("S03", "queued", len(queued))
    report.observe("S03", "delivered", len(queued & state.client_ids))
    assert queued <= state.client_ids
    assert_invariants(club_game, [a], queued)


def test_s04_killed_phone_restarts_offline_then_returns(phones, club_game, report):
    a, _ = phones
    started_game(a, club_game)

    a.offline()
    for _ in range(3):
        a.tap_turnover()
    queued = {op.id for op in a.queue()}
    before = len(server_state(club_game).events)

    a.kill()
    a.restart(offline=True)
    a.open_game(club_game)
    a.wait_tracking()

    after_restart = {op.id for op in a.queue()}
    report.observe("S04", "queue_after_offline_restart", len(after_restart))
    assert after_restart == queued
    assert len(server_state(club_game).events) == before

    a.online()
    a.settle()
    # The hard kill can lose an uncommitted session cookie. The app then pauses
    # with "Pausiert · Anmeldung" and keeps the queue; the official signs in and
    # it drains. Either path is correct, so record which one happened.
    re_login = a.badge() == "Pausiert · Anmeldung"
    report.observe("S04", "relogin_required", re_login)
    report.observe(
        "S04",
        "session_loss_after_hard_kill",
        "yes" if re_login else "no",
    )
    report.observe(
        "S04",
        "session_loss_consequence",
        "a hard kill can lose the uncommitted session cookie; officials may "
        "need their credentials after a restart before the queue can drain",
    )
    if re_login:
        a.login(USERNAME, PASSWORD)
        a.open_game(club_game)
        a.wait_tracking()
    a.wait_queue(0)
    state = server_state(club_game)
    report.observe("S04", "delivered", len(queued & state.client_ids))
    assert queued <= state.client_ids
    assert_invariants(club_game, [a], queued)


def test_s05_offline_undo_removes_the_entry_and_its_effect(phones, club_game, report):
    a, _ = phones
    started_game(a, club_game)
    start_possession = server_state(club_game).in_possession
    # The server stores the side (`home`), the switch shows the team name; keep
    # the phone's own starting label to compare like with like.
    phone_start = a.possession()

    a.offline()
    a.tap_turnover()
    a.undo_last()

    report.observe("S05", "queue_after_undo", [op.kind for op in a.queue()])
    report.observe("S05", "badge_after_undo", a.badge())
    report.observe("S05", "pending_after_undo", len(a.queue()))
    report.observe("S05", "start_possession", start_possession)
    report.observe("S05", "phone_possession_after_undo", a.possession())
    if a.badge() != f"Offline · {len(a.queue())}":
        report.finding(
            "F2",
            "Badge count is stale after undoing a queued op",
            f"After the undo the queue held {len(a.queue())} op(s) but the "
            f"badge read {a.badge()!r}; removing an outbox row did not notify "
            "the sync engine's counts.",
        )

    # Nothing may reach the server while the queue is empty: both the entry
    # and the flip it wrote are gone.
    assert a.queue() == []
    assert phone_start is not None
    assert a.possession() == phone_start

    a.online()
    a.wait_queue(0)
    state = server_state(club_game)
    report.observe("S05", "possession_after", state.in_possession)
    report.observe(
        "S05", "turnover_events", [e.seq for e in state.events if e.code == "turnover"]
    )

    assert not [event for event in state.events if event.code == "turnover"]
    assert state.in_possession == start_possession
    assert_invariants(club_game, [a], set())


def test_s05b_online_undo_removes_the_entry_and_its_effect(phones, club_game, report):
    """The same undo with a connection: the row reached the server already.

    This is the path that had no queued op to drop: the correction removes the
    Turnover row and the possession restore must put the ball back, on the
    server and on the phone.
    """

    a, _ = phones
    started_game(a, club_game)
    start_possession = server_state(club_game).in_possession
    phone_start = a.possession()

    a.tap_turnover()
    a.wait_queue(0)
    written = server_state(club_game)
    report.observe(
        "S05b",
        "turnover_before_undo",
        [event.seq for event in written.events if event.code == "turnover"],
    )
    report.observe("S05b", "possession_before_undo", written.in_possession)
    assert written.in_possession != start_possession

    # The row is already on the server, so undo strikes it through instead of
    # removing it from the log.
    a.undo_last(removed=False)
    a.wait_queue(0)
    # The correction and the restore are two writes; wait until the server has
    # both and the screen shows the marker again.
    deadline = time.monotonic() + 20
    state = server_state(club_game)
    while time.monotonic() < deadline:
        state = server_state(club_game)
        if state.in_possession == start_possession and not [
            event for event in state.events if event.code == "turnover"
        ]:
            break
        a.page.wait_for_timeout(200)

    report.observe("S05b", "possession_after_undo", state.in_possession)
    report.observe("S05b", "phone_possession_after_undo", a.possession())
    report.observe(
        "S05b",
        "turnover_events_after",
        [event.seq for event in state.events if event.code == "turnover"],
    )
    assert not [event for event in state.events if event.code == "turnover"]
    assert state.in_possession == start_possession
    assert phone_start is not None
    assert a.possession() == phone_start
    assert_invariants(club_game, [a], set())


def test_s06_lost_answer_does_not_write_twice(phones, club_game, report):
    a, _ = phones
    started_game(a, club_game)
    baseline = len(server_state(club_game).events)

    captured: dict[str, str] = {}
    fired = {"done": False}

    def handler(route):
        if route.request.method == "POST" and not fired["done"]:
            fired["done"] = True
            captured["client_id"] = route.request.post_data_json["client_id"]
            # Apply it on the server, then lose the answer on the way back.
            route.fetch()
            route.abort()
            return
        route.continue_()

    a.page.route("**/api/game/*/events", handler)
    a.tap_turnover()
    a.wait_queue(0)
    a.page.unroute("**/api/game/*/events")

    state = server_state(club_game)
    written = [
        event for event in state.events if event.client_id == captured["client_id"]
    ]
    report.observe("S06", "aborted_client_id", captured.get("client_id"))
    report.observe("S06", "rows_for_client_id", [event.seq for event in written])
    report.observe("S06", "server_events", len(state.events))
    assert len(written) == 1
    assert len(state.events) == baseline + 2
    assert_invariants(club_game, [a], {captured["client_id"]})


def test_s07_partial_drain_keeps_the_rest_in_order(phones, club_game, report):
    a, _ = phones
    started_game(a, club_game)
    baseline = len(server_state(club_game).events)

    a.offline()
    for _ in range(3):
        a.tap_turnover()
    queued = a.queue()
    ids = {op.id for op in queued}

    posts = {"count": 0}

    def handler(route):
        if route.request.method == "POST":
            posts["count"] += 1
            if posts["count"] > 1:
                route.abort()
                return
        route.continue_()

    a.page.route("**/api/game/*/events", handler)
    a.online()
    a.settle(timeout_ms=10000)

    pending = a.pending()
    report.observe("S07", "posts_seen", posts["count"])
    report.observe("S07", "pending_after_abort", [(op.kind, op.seq) for op in pending])
    assert pending, "the aborted remainder must stay queued"
    assert len(server_state(club_game).events) == baseline + 1

    a.page.unroute("**/api/game/*/events")
    a.page.evaluate("() => window.dispatchEvent(new Event('online'))")
    a.wait_queue(0)

    state = server_state(club_game)
    seqs = [event.seq for event in state.events]
    assert seqs == sorted(seqs)
    assert ids <= state.client_ids
    assert_invariants(club_game, [a], ids)


def test_s07_kill_mid_drain_does_not_duplicate(phones, club_game, report):
    a, _ = phones
    started_game(a, club_game)

    a.offline()
    a.tap_turnover()
    first = a.queue()[0]

    held = []
    applied: dict[str, object] = {"done": False, "status": None}

    def handler(route):
        if route.request.method == "POST":
            # Apply the write but never answer it: the page is killed while the
            # response is in flight, so the op is still in IndexedDB. Reading
            # the body makes the server finish (and commit) the request; the
            # browser still never sees the answer.
            response = route.fetch()
            try:
                response.body()
            except Exception:
                pass
            applied["done"] = True
            applied["status"] = response.status
            held.append(route)
            return
        route.continue_()

    a.page.route("**/api/game/*/events", handler)
    a.online()

    deadline = time.monotonic() + 20
    while time.monotonic() < deadline and not applied["done"]:
        a.page.wait_for_timeout(100)
    if not applied["done"]:
        raise AssertionError("the held write never reached the server")
    assert applied["status"] in (200, 201), applied

    a.kill()
    a.restart()
    a.open_game(club_game)
    a.wait_tracking()
    a.wait_queue(0)

    state = server_state(club_game)
    written = [event for event in state.events if event.client_id == first.id]
    report.observe("S07-kill", "rows_for_first_op", [event.seq for event in written])
    assert len(written) == 1
    assert_invariants(club_game, [a], {first.id})


@pytest.mark.parametrize("state", ["offline", "drained", "rejected"])
def test_s16_badge_count_matches_the_queue(phones, club_game, report, state):
    a, _ = phones
    started_game(a, club_game)
    a.offline()
    a.tap_turnover()

    if state == "offline":
        a.settle()
        report.observe("S16-offline", "badge", a.badge())
        report.observe("S16-offline", "queue", len(a.queue()))
        assert a.badge() == "Offline · 2"
        assert_invariants(club_game, [a], {op.id for op in a.queue()})

    elif state == "drained":
        a.online()
        a.wait_queue(0)
        report.observe("S16-drained", "badge", a.badge())
        assert a.badge() == "Synchron"
        assert_invariants(club_game, [a], set())

    else:

        def handler(route):
            if route.request.method == "POST":
                route.fulfill(
                    status=400,
                    content_type="application/json",
                    body='{"detail": "Test rejection"}',
                )
                return
            route.continue_()

        a.page.route("**/api/game/*/events", handler)
        a.online()
        a.settle()
        a.page.unroute("**/api/game/*/events")
        report.observe("S16-rejected", "badge", a.badge())
        report.observe(
            "S16-rejected", "queue", [(op.kind, op.failed) for op in a.queue()]
        )
        assert a.failed(), "the rejected submission must stay visible"
        assert "abgelehnt" in a.badge()
        assert_invariants(club_game, [a], {op.id for op in a.queue()})
