"""S11–S15 — staff take-over and late returns.

These are the meeting's worst cases: a club phone that died, a staff phone that
took the game over, a late phone that comes back with a queue, and a session
that expires on the sideline.
"""

import pytest

from scorecard_v2.tests.e2e_scenarios.harness import (
    PASSWORD,
    USERNAME,
    assert_invariants,
    server_state,
    started_game,
)

pytestmark = pytest.mark.django_db(transaction=True)


def _wait_read_only(phone) -> None:
    phone.page.wait_for_function(
        "() => document.querySelector('.syncbadge-inline .syncbadge-label')"
        "?.textContent.trim() === 'Nur lesen'",
        timeout=30000,
    )


def test_s11_staff_take_over_of_a_dead_phone(phones, club_game, staff_user, report):
    a, b = phones
    started_game(a, club_game)
    a.kill()

    b.logout_and_login(staff_user)
    b.open_game(club_game)
    b.wait_tracking()
    _wait_read_only(b)
    report.observe("S11", "b_can_take_over", b.can_take_over())
    assert b.can_take_over() is True

    b.take_over()
    b.tap_turnover()

    a.restart()
    a.open_game(club_game)
    a.wait_tracking()
    _wait_read_only(a)

    state = server_state(club_game)
    report.observe("S11", "a_badge", a.badge())
    report.observe("S11", "b_badge", b.badge())
    report.observe("S11", "stored_device_is_b", state.device_id == b.device_id())
    assert a.badge() == "Nur lesen"
    assert state.device_id == b.device_id()
    assert_invariants(club_game, [a, b], set())


@pytest.mark.xfail(
    strict=True,
    reason="F4: after a staff take-over the returning phone keeps its 16 "
    "entries, delivers none and the screen only says 'Nur lesen'",
)
def test_s12_late_phone_after_a_staff_takeover(phones, club_game, staff_user, report):
    a, b = phones
    started_game(a, club_game)

    a.offline()
    for _ in range(8):
        a.tap_turnover()
    stranded = {op.id for op in a.queue()}
    a.kill()

    b.logout_and_login(staff_user)
    b.open_game(club_game)
    b.wait_tracking()
    _wait_read_only(b)
    b.take_over()
    for _ in range(3):
        b.tap_turnover()

    a.restart()
    a.open_game(club_game)
    a.wait_tracking()
    b.tap_turnover()  # signal returns while the other phone is writing
    a.settle()

    state = server_state(club_game)
    delivered = stranded & state.client_ids
    report.observe("S12", "stranded_total", len(stranded))
    report.observe("S12", "delivered", len(delivered))
    report.observe("S12", "still_on_a", len(a.queue()))
    report.observe("S12", "a_badge", a.badge())
    report.observe("S12", "a_strip", a.strip())
    report.observe("S12", "a_shown_entries", a.shown_entries())
    report.observe("S12", "a_stranded_note", a.stranded_note())
    report.observe("S12", "a_stranded_rows", len(a.open_stranded()))
    report.finding(
        "F4",
        "A returning phone strands its entries after a staff take-over",
        f"{len(stranded)} ops stayed on the old phone and {len(delivered)} "
        "reached the official record; the screen only said 'Nur lesen' and "
        "named neither the count nor the entries, so the official could not "
        "see that their writes are missing from the game.",
        rank=0,
    )
    assert a.badge() == "Nur lesen"
    assert len(delivered) == 0
    assert len(a.queue()) == len(stranded)
    # The read-only strip must name the count and say they are not in the
    # official record; the entries themselves are one tap away.
    strip = a.strip() or ""
    assert str(len(stranded)) in strip
    assert "nicht übertragen" in strip or "nicht im offiziellen" in strip
    assert a.shown_entries() >= len(stranded)
    assert len(a.open_stranded()) == len(stranded)
    assert_invariants(club_game, [a, b], stranded)


@pytest.mark.xfail(
    strict=True,
    reason="F5: a phone that lost the lock shows its own optimistic 13:0 "
    "while the server and the other phone show 7:0, without labelling the "
    "difference",
)
def test_s13_scores_differ_and_stay_different(phones, club_game, staff_user, report):
    a, b = phones
    started_game(a, club_game)

    a.offline()
    a.touchdown(7)
    stranded = {op.id for op in a.queue()}
    a.kill()

    b.logout_and_login(staff_user)
    b.open_game(club_game)
    b.wait_tracking()
    _wait_read_only(b)
    b.take_over()
    b.touchdown(9, extra="+1")

    a.restart()
    a.open_game(club_game)
    a.wait_tracking()
    a.settle()

    state = server_state(club_game)
    report.observe("S13", "a_score", a.score())
    report.observe("S13", "b_score", b.score())
    report.observe("S13", "server_score", (state.score_home, state.score_away))
    report.observe("S13", "a_stranded_note", a.stranded_note())
    report.observe("S13", "stranded", len(stranded))
    report.observe("S13", "delivered", len(stranded & state.client_ids))
    report.observe("S13", "a_badge", a.badge())
    report.finding(
        "F5",
        "A phone that lost the lock shows a different score without saying so",
        f"A showed {a.score()[0]}:{a.score()[1]} while B and the server showed "
        f"{state.score_home}:{state.score_away}; the screen had no marker that "
        "its number is the device's own and not the official result.",
        rank=1,
    )
    # The official score is the main score on every phone, including the one
    # whose own entries never left the device.
    assert a.score() == (state.score_home, state.score_away)
    assert b.score() == (state.score_home, state.score_away)
    # The device's own number is still shown, clearly labelled as differing.
    note = a.stranded_note() or ""
    assert "nicht offiziell" in note or "abweichend" in note
    assert_invariants(club_game, [a, b], stranded)


def test_s14_late_phone_after_the_final_whistle(phones, club_game, staff_user, report):
    a, b = phones
    started_game(a, club_game)

    a.offline()
    for _ in range(3):
        a.tap_turnover()
    stranded = {op.id for op in a.queue()}
    a.kill()

    b.logout_and_login(staff_user)
    b.open_game(club_game)
    b.wait_tracking()
    _wait_read_only(b)
    b.take_over()
    b.finalize()

    a.restart()
    a.open_game(club_game)
    a.wait_tracking()
    a.settle()

    club_game.refresh_from_db()
    state = server_state(club_game)
    report.observe("S14", "game_status", club_game.status)
    report.observe("S14", "a_badge", a.badge())
    report.observe(
        "S14", "failed_headers", a.page.locator(".syncfailed-head").all_inner_texts()
    )
    report.observe("S14", "a_queue", [(op.kind, op.failed) for op in a.queue()])
    report.observe(
        "S14", "failed_reasons", sorted({op.failed_reason for op in a.failed()})
    )
    assert club_game.status.strip().lower() == "beendet"
    assert a.failed()
    assert all("beendet" in (op.failed_reason or "") for op in a.failed())
    assert any(
        "abgelehnt" in text.lower()
        for text in a.page.locator(".syncfailed-head").all_inner_texts()
    )
    assert_invariants(club_game, [a, b], stranded)


def test_s15_session_expiry_pauses_then_drains(phones, club_game, report):
    a, _ = phones
    started_game(a, club_game)

    a.offline()
    for _ in range(2):
        a.tap_turnover()
    queued = {op.id for op in a.queue()}
    a.clear_session_cookies()
    a.online()
    a.settle()

    report.observe("S15", "badge_after_expiry", a.badge())
    report.observe("S15", "queue_after_expiry", len(a.queue()))
    assert a.badge() == "Pausiert · Anmeldung"
    assert {op.id for op in a.queue()} == queued

    a.login(USERNAME, PASSWORD)
    a.open_game(club_game)
    a.wait_tracking()
    a.wait_queue(0)

    state = server_state(club_game)
    report.observe("S15", "delivered", len(queued & state.client_ids))
    assert queued <= state.client_ids
    assert_invariants(club_game, [a], queued)


@pytest.mark.xfail(
    strict=True,
    reason="F3: events replayed after a different user logs in carry the new user as author",
)
def test_s15_other_user_keeps_the_original_author(
    phones, club_game, club_user, other_club_user, report
):
    a, _ = phones
    started_game(a, club_game)

    a.offline()
    for _ in range(2):
        a.tap_turnover()
    queued = {op.id for op in a.queue()}
    a.clear_session_cookies()
    a.online()
    a.settle()
    assert a.badge() == "Pausiert · Anmeldung"

    a.login(other_club_user["username"], other_club_user["password"])
    a.open_game(club_game)
    a.wait_tracking()
    a.wait_queue(0)

    state = server_state(club_game)
    delivered = [event for event in state.events if event.client_id in queued]
    authors = sorted({event.author_id for event in delivered})
    report.observe("S15-other", "authors", authors)
    report.observe("S15-other", "original_user", club_user.pk)
    report.observe("S15-other", "other_user", other_club_user["user"].pk)
    report.finding(
        "F3",
        "A queued op changes author when another user logs in",
        "The outbox row stores no author. After the second club user logged in, "
        f"the replayed events carried author ids {authors} instead of the "
        f"original {club_user.pk}; the request's session decides the author.",
    )
    assert authors == [club_user.pk]
    assert_invariants(club_game, [a], queued)
