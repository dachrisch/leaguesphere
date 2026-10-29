"""Row-level corrections: an undo of a sequence-0 row is an event too.

Every penalty, clock, timeout and first down shares ``TeamLog.sequence`` 0 with
every other one, so "delete the sequence" would wipe the whole bucket. The
event that wrote such a row stores it (``GameEvent.team_log``), and a
correction naming that event marks exactly that row -- no ``DELETE`` request,
no reconciliation flag, and the neighbouring penalties survive.
"""

from http import HTTPStatus

import pytest
from rest_framework.reverse import reverse

from gameevents.models import GameEvent, GameState
from gameevents.service.append import _link_shadow_rows
from gameevents.service.log_payload import event_seqs_for_rows_by_game
from gameevents.service.reconcile import check_games, rebuild_game
from gameevents.tests.api.support import (
    legacy_body,
    login,
    make_game,
    post_events,
    post_legacy,
    sub_id,
)
from gamedays.constants import API_GAMELOG
from gamedays.models import TeamLog


def penalty(code="Holding", player=23):
    return {
        "type": "penalty",
        "code": code,
        "side": "home",
        "player": player,
    }


def get_log(client, game):
    return client.get(reverse(API_GAMELOG, kwargs={"id": game.pk})).json()


def undo(client, game, seq):
    # One submission id per target: two undos of *different* seqs are two
    # submissions, and reusing one id would be answered as a replay.
    response = post_events(
        client,
        game,
        {
            "events": [
                {"type": "correction", "code": "undo", "payload": {"undo_of": seq}}
            ],
            "client_id": sub_id(1000 + seq),
        },
    )
    assert response.status_code == HTTPStatus.CREATED, response.content
    return response


@pytest.mark.django_db
def test_undoing_a_penalty_deletes_only_that_row(client):
    login(client)
    game, _home, _away = make_game("rowundo")

    post_events(
        client, game, {"events": [penalty("Holding")], "client_id": sub_id(1)}
    )
    post_events(
        client, game, {"events": [penalty("Fehlstart", player=None)], "client_id": sub_id(2)}
    )
    post_events(
        client,
        game,
        {"events": [{"type": "timeout", "code": "home", "side": "home"}], "client_id": sub_id(3)},
    )

    rows = {
        row.event: row
        for row in TeamLog.objects.filter(gameinfo=game).order_by("pk")
    }
    holding = next(
        row for row in TeamLog.objects.filter(gameinfo=game, input="Holding")
    )
    assert holding.sequence == 0
    assert holding.gameinfo_id == game.pk

    # The penalty's row is addressed by the event that wrote it, not by the
    # shared sequence.
    event = GameEvent.objects.get(game=game, team_log=holding)
    undo(client, game, event.seq)

    holding.refresh_from_db()
    assert holding.isDeleted
    # The sibling penalty, the timeout and the game markers are untouched.
    assert TeamLog.objects.filter(
        gameinfo=game, isDeleted=False, event="Strafe"
    ).count() == 1
    assert TeamLog.objects.filter(
        gameinfo=game, isDeleted=False, event="Auszeit"
    ).count() == 1
    assert TeamLog.objects.filter(
        gameinfo=game, isDeleted=True
    ).count() == 1

    # A penalty never scores; the correction must not either.
    state = GameState.objects.get(game=game)
    assert (state.score_home, state.score_away) == (0, 0)


@pytest.mark.django_db
def test_undoing_a_penalty_leaves_the_projection_reconciled(client):
    login(client)
    game, _home, _away = make_game("rowundo")

    post_events(
        client, game, {"events": [penalty("Holding")], "client_id": sub_id(1)}
    )
    holding = TeamLog.objects.get(gameinfo=game, input="Holding")
    undo(client, game, GameEvent.objects.get(game=game, team_log=holding).seq)

    [check] = check_games([game.pk])

    assert check.ok, check.summary()


@pytest.mark.django_db
def test_a_rebuild_relinks_the_group_rows_it_recreates(client):
    login(client)
    game, _home, _away = make_game("rowundo")

    post_events(
        client,
        game,
        {
            "events": [
                {"type": "score", "code": "touchdown", "side": "home", "player": 7},
                {"type": "penalty", "code": "Holding", "side": "home"},
            ],
            "client_id": sub_id(1),
        },
    )
    before = {
        event.seq: event.team_log_id
        for event in GameEvent.objects.filter(game=game)
    }

    result = rebuild_game(game)

    # Only the group the log owns (sequence > 0) is re-created; the shared
    # sequence 0 is left alone, so its link still points at the same row.
    assert result.rows_written == 1
    after = {
        event.seq: event.team_log_id
        for event in GameEvent.objects.filter(game=game)
    }
    assert set(after) == set(before)
    assert all(value is not None for value in after.values())
    assert after[1] != before[1]  # the touchdown row (sequence 1) was rebuilt
    assert after[2] == before[2]  # the penalty row (sequence 0) was not touched
    # The log still publishes the handle, now pointing at the new row.
    payload = get_log(client, game)
    seqs = {event["seq"] for event in payload["events"]}
    assert seqs == {1, 2}
    linked = {row.pk for row in TeamLog.objects.filter(gameinfo=game)}
    assert set(after.values()) <= linked


@pytest.mark.django_db
def test_the_legacy_delete_records_a_correction_for_a_linked_penalty_row(client):
    # The old app still posts DELETE for a single row. When that row was
    # written by an event, the log records the same row-level correction the
    # v2 app sends -- no reconciliation flag.
    login(client)
    game, home, _away = make_game("rowundo")
    post_events(
        client, game, {"events": [penalty("Holding")], "client_id": sub_id(1)}
    )
    row = TeamLog.objects.get(gameinfo=game, input="Holding")

    response = client.delete(
        reverse(API_GAMELOG, kwargs={"id": game.pk}),
        {"team_log_id": row.pk},
        content_type="application/json",
    )

    assert response.status_code == HTTPStatus.OK
    row.refresh_from_db()
    assert row.isDeleted
    correction = GameEvent.objects.get(game=game, type=GameEvent.Type.CORRECTION)
    assert correction.payload == {"undo_of": 1}
    state = GameState.objects.get(game=game)
    assert state.needs_reconciliation is False
    [check] = check_games([game.pk])
    assert check.ok, check.summary()


@pytest.mark.django_db
def test_a_rebuild_does_not_depend_on_bulk_create_returning_pks(client, monkeypatch):
    # Django's Oracle MySQL backend reports
    # can_return_rows_from_bulk_insert = False, so ``bulk_create`` leaves every
    # ``pk`` as None there. The rebuild must link the rows it creates without
    # that guarantee; if it ever goes back to a bulk insert, this test fails on
    # any backend.
    login(client)
    game, _home, _away = make_game("rowundo")
    post_events(
        client,
        game,
        {
            "events": [
                {"type": "score", "code": "touchdown", "side": "home", "player": 7},
                {"type": "penalty", "code": "Holding", "side": "home"},
            ],
            "client_id": sub_id(1),
        },
    )

    def forbidden(*args, **kwargs):  # pragma: no cover - it must not run
        raise AssertionError(
            "bulk_create leaves pk None on Oracle MySQL; link rows without it"
        )

    monkeypatch.setattr(TeamLog.objects, "bulk_create", forbidden)
    rebuild_game(game)

    linked = {
        event.seq: event.team_log_id for event in GameEvent.objects.filter(game=game)
    }
    assert all(pk is not None for pk in linked.values()), linked
    assert set(linked.values()) <= set(
        TeamLog.objects.filter(gameinfo=game).values_list("pk", flat=True)
    )


@pytest.mark.django_db
def test_a_legacy_post_answers_its_own_rows_with_their_seq(client):
    # The log a legacy POST answers with is serialized *after* the shadow
    # append, so the rows it just wrote already carry their event ``seq`` --
    # the handle for undoing them, without a second read.
    login(client)
    game, home, _away = make_game("rowundo")

    response = post_legacy(
        client,
        game,
        legacy_body(
            game,
            home,
            [{"name": "Touchdown", "player": 7}, {"name": "Strafe", "input": "Holding"}],
            client_id=sub_id(1),
        ),
    )

    assert response.status_code == HTTPStatus.CREATED
    seqs = {event["event"]: event["seq"] for event in response.json()["events"]}
    assert seqs == {"Touchdown": 1, "Strafe": 2}


@pytest.mark.django_db
def test_a_row_level_correction_refuses_an_event_without_a_linked_row(client):
    # An event stored before rows were linked cannot name a row. The service
    # must refuse it as a client error instead of deleting nothing (or, worse,
    # the shared bucket).
    login(client)
    game, _home, _away = make_game("rowundo")
    post_events(
        client, game, {"events": [penalty("Holding")], "client_id": sub_id(1)}
    )
    event = GameEvent.objects.get(game=game, type="penalty")
    GameEvent.objects.filter(pk=event.pk).update(team_log=None)

    response = post_events(
        client,
        game,
        {
            "events": [
                {
                    "type": "correction",
                    "code": "undo",
                    "payload": {"undo_of": event.seq},
                }
            ],
            "client_id": sub_id(2),
        },
    )

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert "no row to change" in response.json()["detail"]


@pytest.mark.django_db
def test_undoing_the_undo_of_a_penalty_restores_that_row(client):
    # A correction of a correction restores the row it removed (the restored
    # side of the row-level flags, not just the deleted one).
    login(client)
    game, _home, _away = make_game("rowundo")

    post_events(
        client, game, {"events": [penalty("Holding")], "client_id": sub_id(1)}
    )
    row = TeamLog.objects.get(gameinfo=game, input="Holding")
    undo_seq = GameEvent.objects.get(game=game, team_log=row).seq

    undo(client, game, undo_seq)
    row.refresh_from_db()
    assert row.isDeleted

    correction = GameEvent.objects.get(game=game, type=GameEvent.Type.CORRECTION)
    undo(client, game, correction.seq)

    row.refresh_from_db()
    assert not row.isDeleted
    [check] = check_games([game.pk])
    assert check.ok, check.summary()


@pytest.mark.django_db
def test_a_shadow_append_logs_a_row_mismatch(client, caplog):
    # One row per entry is the writer's contract. When it breaks, the events
    # stay unlinked -- and operations must be able to see that.
    login(client)
    game, home, _away = make_game("rowundo")
    post_legacy(
        client,
        game,
        legacy_body(
            game, home, [{"name": "Touchdown", "player": 7}], client_id=sub_id(1)
        ),
    )
    client_id = GameEvent.objects.get(game=game).client_id

    with caplog.at_level("WARNING"):
        _link_shadow_rows(game, client_id, [])

    assert "the events stay unlinked" in caplog.text
    # Nothing was written: the link the append made on the way in survives.
    assert GameEvent.objects.get(game=game).team_log_id is not None


@pytest.mark.django_db
def test_the_log_payload_skips_a_group_whose_sequence_is_zero(client):
    # A stored submission with legacy_sequence 0 would map to the shared bucket,
    # which names no row: the payload must not publish a group seq for it. The
    # writer never produces this (it sets None or a max+1 > 0), so the event is
    # created directly -- this is the guard against stored data.
    login(client)
    game, home, _away = make_game("rowundo")
    post_events(
        client, game, {"events": [penalty("Holding")], "client_id": sub_id(1)}
    )
    row = TeamLog.objects.get(gameinfo=game, input="Holding")
    event = GameEvent.objects.get(game=game, team_log=row)
    GameEvent.objects.filter(pk=event.pk).update(team_log=None, legacy_sequence=0)

    payload = get_log(client, game)

    published = {event["event"]: event["seq"] for event in payload["events"]}
    assert published == {"Strafe": None}
    # And the empty scope (no games) answers without a query.
    assert event_seqs_for_rows_by_game({}, []) == {}
