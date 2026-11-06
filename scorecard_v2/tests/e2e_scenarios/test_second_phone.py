"""S08–S10 and S17 — the second phone and the device lock.

These pin what happens when two phones with the same club account compete for a
game, and what a phone that lost its own device id sees when it comes back.
"""

import pytest
from django.db import connection

from scorecard_v2.tests.e2e_scenarios.harness import (
    assert_invariants,
    server_state,
    started_game,
)

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.mark.skipif(
    connection.vendor == "sqlite",
    reason="SQLite serialises every write, so two simultaneous starts cannot "
    "race; only the MariaDB row lock exercises the guard this test pins.",
)
def test_s08b_simultaneous_start_writes_exactly_one(phones, club_game, report):
    """Both final clicks in flight at once: one device wins, one start is written.

    S08 starts the second phone only after the first answered, which a
    single-writer SQLite happily serialises. This test dispatches both POSTs
    without waiting for either, so the row lock is the only thing that can
    keep the two ``Spiel gestartet`` writes apart.
    """

    a, b = phones
    a.open_game(club_game)
    b.open_game(club_game)
    a.prepare_start()
    b.prepare_start()

    # No awaiting in between: both requests are dispatched back to back and
    # race on the same game row.
    a.click_start_unawaited()
    b.click_start_unawaited()
    a.wait_started_or_refused()
    b.wait_started_or_refused()

    state = server_state(club_game)
    start_rows = [row for row in state.team_log if row.event == "Spiel gestartet"]
    tracking = [
        phone.name for phone in (a, b) if phone.page.locator(".tracking").count()
    ]
    report.observe("S08b", "start_rows", len(start_rows))
    report.observe("S08b", "tracking_phones", tracking)
    report.observe("S08b", "stored_device", state.device_id)
    report.observe("S08b", "a_device", a.device_id())
    report.observe("S08b", "b_device", b.device_id())

    assert len(start_rows) == 1
    assert len(tracking) == 1
    winner = a if tracking[0] == a.name else b
    assert state.device_id == winner.device_id()
    assert_invariants(club_game, [a, b], set())


def _wait_read_only(phone) -> None:
    phone.page.wait_for_function(
        "() => document.querySelector('.syncbadge-inline .syncbadge-label')"
        "?.textContent.trim() === 'Nur lesen'",
        timeout=30000,
    )


def test_s08_both_on_setup_the_second_start_is_refused(phones, club_game, report):
    a, b = phones
    a.open_game(club_game)
    b.open_game(club_game)
    assert a.page.locator(".prep").count() == 1
    assert b.page.locator(".prep").count() == 1

    report.observe("S08", "b_warning_before_start", b.page.locator(".seterror").count())
    report.observe(
        "S08", "b_readiness_before_start", b.page.locator(".readybar").inner_text()
    )

    a.start_game()
    a_device = a.device_id()
    error = b.attempt_start()

    state = server_state(club_game)
    start_rows = [row for row in state.team_log if row.event == "Spiel gestartet"]
    report.observe("S08", "b_error", error)
    report.observe(
        "S08", "b_readiness_after_start", b.page.locator(".readybar").inner_text()
    )
    report.observe("S08", "stored_device", state.device_id)
    report.observe("S08", "a_device", a_device)
    report.observe("S08", "start_rows", len(start_rows))
    report.observe("S08", "event_codes", [event.code for event in state.events])

    assert error is not None
    assert "anderen Gerät" in error
    assert "Nur lesen" in b.page.locator(".readybar").inner_text()
    assert b.page.locator(".tracking").count() == 0
    assert state.device_id == a_device
    assert len(start_rows) == 1
    assert_invariants(club_game, [a, b], set())


def test_s09_second_phone_opens_a_held_game_read_only(phones, club_game, report):
    a, b = phones
    started_game(a, club_game)
    before = server_state(club_game)

    b.open_game(club_game)
    _wait_read_only(b)

    report.observe("S09", "b_badge", b.badge())
    report.observe("S09", "b_strip", b.strip())
    report.observe("S09", "b_can_take_over", b.can_take_over())

    assert b.badge() == "Nur lesen"
    assert b.can_take_over() is False
    assert b.page.locator("button.tdbtn").is_disabled()
    assert b.page.get_by_role("button", name="Turnover", exact=True).is_disabled()
    assert b.queue() == []
    assert len(server_state(club_game).events) == len(before.events)
    assert_invariants(club_game, [a, b], set())


def test_s10_club_phone_cannot_continue_when_the_holder_dies(phones, club_game, report):
    a, b = phones
    started_game(a, club_game)

    a.offline()
    a.tap_turnover()
    queued = {op.id for op in a.queue()}
    a.kill()

    b.open_game(club_game)
    _wait_read_only(b)
    report.observe("S10", "b_badge", b.badge())
    report.observe("S10", "b_strip", b.strip())
    report.observe("S10", "b_can_take_over", b.can_take_over())

    assert b.badge() == "Nur lesen"
    assert b.can_take_over() is False

    a.restart()
    a.open_game(club_game)
    a.wait_tracking()
    a.wait_queue(0)

    state = server_state(club_game)
    report.observe("S10", "delivered", len(queued & state.client_ids))
    assert queued <= state.client_ids
    assert_invariants(club_game, [a, b], queued)


def test_s17_new_device_id_locks_a_phone_out_of_its_own_game(phones, club_game, report):
    a, _ = phones
    started_game(a, club_game)

    a.offline()
    a.tap_turnover()
    queued = {op.id for op in a.queue()}
    old_device = a.device_id()

    a.clear_device_id()
    a.reload()
    a.wait_tracking()
    new_device = a.device_id()

    a.online()
    a.reload()
    a.wait_tracking()
    a.settle()

    state = server_state(club_game)
    report.observe("S17", "old_device", old_device)
    report.observe("S17", "new_device", new_device)
    report.observe("S17", "stored_device", state.device_id)
    report.observe("S17", "badge", a.badge())
    report.observe("S17", "strip", a.strip())
    report.observe("S17", "queue", [(op.kind, op.failed) for op in a.queue()])
    report.observe("S17", "delivered", len(queued & state.client_ids))

    assert new_device != old_device
    assert state.device_id == old_device
    assert a.badge() == "Nur lesen"
    assert_invariants(club_game, [a], queued)
