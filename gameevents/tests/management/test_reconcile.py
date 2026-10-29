"""Reconciliation: ``check_game_projection`` and ``rebuild_game_projection`` (T6).

The acceptance is a deliberately broken projection: a wrong score/period and a
wrong row must be detected (with the game and the offending ``seq``), a rebuild
must put both back and clear the flag, and a legacy game (no events) must be
refused by the rebuild and skipped by the check -- never half-rewritten.
"""

import json
from io import StringIO
from unittest import mock

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework.reverse import reverse

from gameevents.models import GameEvent, GameState
from gameevents.service.append import (
    AuthorResolver,
    append_submission,
    project_game,
)
from gameevents.service.projector import GameEventValue
from gameevents.service.reconcile import check_games, owned_sequences
from gameevents.tests.api.support import login, make_game, post_events
from gamedays.constants import API_GAMELOG
from gamedays.models import TeamLog
from gamedays.tests.setup_factories.factories import UserFactory

TD = {"type": "score", "code": "touchdown", "side": "home", "player": 7, "period": 1}
PAT = {"type": "score", "code": "pat1", "side": "home", "player": 7, "period": 1}


def event_game(label):
    """A game whose rows and state were written by the canonical endpoint."""

    game, home, away = make_game(label)
    return game, home, away


def write_events(client, game):
    login(client)
    response = post_events(
        client,
        game,
        {"events": [TD, PAT], "client_id": "sub-1"},
    )
    assert response.status_code == 201, response.content


def check_one(game):
    return check_games([game.pk])[0]


@pytest.mark.django_db
def test_check_reports_a_corrupted_state(client):
    game, _home, _away = event_game("recheck-state")
    write_events(client, game)
    GameState.objects.filter(game=game).update(score_home=13, period=2)

    out = StringIO()
    with pytest.raises(CommandError) as error:
        call_command("check_game_projection", "--game", str(game.pk), stdout=out)

    output = out.getvalue()
    assert f"game {game.pk}: DRIFT at seq 2" in output
    assert "score_home 13 != 7 (log)" in output
    assert "period 2 != 1 (log)" in output
    assert "drift" in str(error.value)


@pytest.mark.django_db
def test_check_reports_a_corrupted_row_flag(client):
    game, _home, _away = event_game("recheck-row-flag")
    write_events(client, game)
    TeamLog.objects.filter(gameinfo=game, event="Touchdown").update(isDeleted=True)

    out = StringIO()
    with pytest.raises(CommandError):
        call_command("check_game_projection", "--game", str(game.pk), stdout=out)

    output = out.getvalue()
    assert f"game {game.pk}: DRIFT at seq 1 (rows)" in output
    assert "isDeleted True != False (log)" in output


@pytest.mark.django_db
def test_check_reports_a_corrupted_row_value(client):
    game, _home, _away = event_game("recheck-row-value")
    write_events(client, game)
    row = TeamLog.objects.get(gameinfo=game, event="Touchdown")
    row.value = 0
    row.save(update_fields=["value"])

    out = StringIO()
    with pytest.raises(CommandError):
        call_command("check_game_projection", "--game", str(game.pk), stdout=out)

    output = out.getvalue()
    assert f"game {game.pk}: DRIFT at seq 1 (rows)" in output
    assert "value 0 != 6 (log)" in output


@pytest.mark.django_db
def test_check_reports_a_missing_state_and_a_flagged_game(client):
    game, _home, _away = event_game("recheck-flag")
    write_events(client, game)
    GameState.objects.filter(game=game).update(
        needs_reconciliation=True, reconciliation_note="undo of sequence 4"
    )

    check = check_one(game)
    assert check.drift.kind == "flag"
    assert check.drift.seq == 2
    assert "undo of sequence 4" in check.drift.detail

    GameState.objects.filter(game=game).delete()
    check = check_one(game)
    assert check.drift.kind == "state"
    assert "no GameState row" in check.drift.detail


@pytest.mark.django_db
def test_rebuild_restores_the_state_and_the_rows(client):
    game, _home, _away = event_game("recheck-rebuild")
    write_events(client, game)
    before = {
        row.pk: (row.event, row.value, row.isDeleted, row.created_time, row.author_id)
        for row in TeamLog.objects.filter(gameinfo=game)
    }
    GameState.objects.filter(game=game).update(score_home=13, period=2)
    TeamLog.objects.filter(gameinfo=game, event="Touchdown").update(
        value=99, isDeleted=True
    )

    call_command("rebuild_game_projection", "--game", str(game.pk), stdout=StringIO())

    state = GameState.objects.get(game=game)
    replayed = project_game(game).state
    assert (
        state.score_home,
        state.score_away,
        state.period,
        state.in_possession,
        state.last_seq,
    ) == (
        replayed.score_home,
        replayed.score_away,
        replayed.period,
        replayed.in_possession,
        replayed.last_seq,
    ) == (7, 0, 1, None, 2)
    assert state.needs_reconciliation is False

    rows = TeamLog.objects.filter(gameinfo=game).order_by("pk")
    assert [(row.event, row.value, row.isDeleted) for row in rows] == [
        ("Touchdown", 6, False),
        ("1-Extra-Punkt", 1, False),
    ]
    # Tick timestamps and authors survive a rebuild.
    assert {(row.event, row.created_time, row.author_id) for row in rows} == {
        (event, created_time, author_id)
        for event, _value, _deleted, created_time, author_id in before.values()
    }
    assert check_one(game).ok


@pytest.mark.django_db
def test_rebuild_restores_the_author_each_event_recorded(client):
    game, _home, _away = event_game("recheck-authors")
    login(client)
    response = post_events(
        client, game, {"events": [TD, PAT], "client_id": "sub-1"}
    )
    assert response.status_code == 201
    actor_id = GameEvent.objects.get(game=game, seq=1).author_id
    # Someone (or a broken write) reassigned the ticks; the log still knows who
    # recorded them, and the rebuild must say so.
    TeamLog.objects.filter(gameinfo=game).update(author=UserFactory())

    call_command("rebuild_game_projection", "--game", str(game.pk), stdout=StringIO())

    assert set(
        TeamLog.objects.filter(gameinfo=game).values_list("author_id", flat=True)
    ) == {actor_id}
    assert check_one(game).ok


@pytest.mark.django_db
def test_rebuild_uses_the_game_author_when_an_event_has_no_actor(client):
    game, _home, _away = event_game("recheck-no-actor")
    # A system write: the events record no actor and no rows are written.
    append_submission(
        game,
        [
            GameEventValue(
                type="score", code="touchdown", side="home", player=7, seq=1
            )
        ],
        client_id="system-1",
        source=GameEvent.Source.STAFF,
        write_rows=False,
    )
    actorless = set(
        GameEvent.objects.filter(game=game).values_list("author_id", flat=True)
    )
    assert actorless == {None}

    call_command("rebuild_game_projection", "--game", str(game.pk), stdout=StringIO())

    # No actor on the log, so the game's author is the honest fallback -- and it
    # is a real user, not TeamLog's default id.
    assert set(
        TeamLog.objects.filter(gameinfo=game).values_list("author_id", flat=True)
    ) == {game.gameday.author_id}
    assert game.gameday.author_id != 1


@pytest.mark.django_db
def test_rebuild_takes_the_author_override_for_actorless_rows(client):
    game, _home, _away = event_game("recheck-author-flag")
    append_submission(
        game,
        [
            GameEventValue(
                type="score", code="touchdown", side="home", player=7, seq=1
            )
        ],
        client_id="system-1",
        source=GameEvent.Source.STAFF,
        write_rows=False,
    )
    override = UserFactory(username="rebuild-actor")

    call_command(
        "rebuild_game_projection",
        "--game",
        str(game.pk),
        "--author",
        str(override.pk),
        stdout=StringIO(),
    )

    assert set(
        TeamLog.objects.filter(gameinfo=game).values_list("author_id", flat=True)
    ) == {override.pk}


@pytest.mark.django_db
def test_rebuild_refuses_when_no_author_can_be_found(client):
    game, _home, _away = event_game("recheck-author-missing")
    append_submission(
        game,
        [
            GameEventValue(
                type="score", code="touchdown", side="home", player=7, seq=1
            )
        ],
        client_id="system-1",
        source=GameEvent.Source.STAFF,
        write_rows=False,
    )

    # No user row matches the ids the game names (the shape of a user table
    # that lost the row a default key still points at, which is what MySQL
    # rejects -- #2125): the rebuild must refuse, not fall back to id 1.
    with mock.patch.object(AuthorResolver, "exists", return_value=False):
        with pytest.raises(CommandError) as error:
            call_command(
                "rebuild_game_projection", "--game", str(game.pk), stdout=StringIO()
            )

    assert "no author for the event" in str(error.value)
    # Refused before anything was written: no row falls back to a default user.
    assert not TeamLog.objects.filter(gameinfo=game).exists()


@pytest.mark.django_db
def test_rebuild_clears_the_flag_and_keeps_pre_log_rows(client):
    game, _home, _away = event_game("recheck-flag-clear")
    write_events(client, game)
    TeamLog.objects.create(
        gameinfo=game,
        sequence=7,
        event="Strafe",
        input="Holding",
        half=1,
        author=game.gameday.author,
    )
    GameState.objects.filter(game=game).update(
        needs_reconciliation=True, reconciliation_note="undo of sequence 4"
    )

    out = StringIO()
    call_command("rebuild_game_projection", "--game", str(game.pk), stdout=out)

    state = GameState.objects.get(game=game)
    assert state.needs_reconciliation is False
    assert state.reconciliation_note == ""
    assert TeamLog.objects.filter(gameinfo=game, sequence=7, event="Strafe").exists()
    assert TeamLog.objects.filter(gameinfo=game, sequence__in=[1, 2]).count() == 2
    assert "needs_reconciliation cleared" in out.getvalue()
    assert check_one(game).ok


@pytest.mark.django_db
def test_rebuild_refuses_a_legacy_game(client):
    game, home, _away = make_game("recheck-legacy-rebuild")
    login(client)
    TeamLog.objects.create(
        gameinfo=game,
        team=home,
        sequence=1,
        event="Touchdown",
        player=7,
        value=6,
        half=1,
        author=game.gameday.author,
    )
    before = list(TeamLog.objects.filter(gameinfo=game).values_list("pk", flat=True))

    with pytest.raises(CommandError) as error:
        call_command(
            "rebuild_game_projection", "--game", str(game.pk), stdout=StringIO()
        )

    assert "no events" in str(error.value)
    assert "legacy" in str(error.value)
    assert (
        list(TeamLog.objects.filter(gameinfo=game).values_list("pk", flat=True))
        == before
    )
    assert not GameState.objects.filter(game=game).exists()


@pytest.mark.django_db
def test_all_skips_legacy_games_without_failing(client):
    game, _home, _away = event_game("recheck-all")
    write_events(client, game)
    legacy, legacy_home, _away = make_game("recheck-all-legacy")
    TeamLog.objects.create(
        gameinfo=legacy,
        team=legacy_home,
        sequence=1,
        event="Touchdown",
        player=7,
        value=6,
        half=1,
        author=legacy.gameday.author,
    )

    out = StringIO()
    call_command("check_game_projection", "--all", stdout=out)

    output = out.getvalue()
    assert f"game {game.pk}: ok (2 events, seq 2)" in output
    assert "skipped 1 legacy game(s)" in output
    assert "checked 1 event-sourced game(s)" in output


@pytest.mark.django_db
def test_all_detects_drift_with_the_game_and_the_seq(client):
    game, _home, _away = event_game("recheck-all-drift")
    write_events(client, game)
    TeamLog.objects.filter(gameinfo=game, event="Touchdown").update(value=0)

    out = StringIO()
    with pytest.raises(CommandError):
        call_command("check_game_projection", "--all", stdout=out)

    output = out.getvalue()
    assert f"game {game.pk}: DRIFT at seq 1 (rows)" in output
    assert "value 0 != 6 (log)" in output


@pytest.mark.django_db
def test_check_ignores_sequence_zero_rows_the_log_did_not_write(client):
    game, _home, _away = event_game("recheck-seq0")
    write_events(client, game)
    TeamLog.objects.create(
        gameinfo=game,
        sequence=0,
        event="Strafe",
        input="Holding",
        half=1,
        author=game.gameday.author,
    )

    assert check_one(game).ok


@pytest.mark.django_db
def test_all_is_a_constant_number_of_queries(client, assert_num_queries):
    game, _home, _away = event_game("recheck-queries")
    login(client)
    events = [
        {"type": "score", "code": "touchdown", "side": "home", "player": 7, "period": 1}
    ] * 6
    assert (
        post_events(
            client,
            game,
            {"events": events, "client_id": "big"},
        ).status_code
        == 201
    )

    with assert_num_queries(5):
        check_games()

    assert owned_sequences(project_game(game)) == {1}


@pytest.mark.django_db
def test_a_correction_keeps_the_projection_consistent(client):
    """A real undo writes a correction, so check stays green (no flag)."""

    game, home, _away = make_game("recheck-undo")
    login(client)
    post_events(
        client,
        game,
        {
            "events": [TD],
            "client_id": "sub-1",
        },
    )
    response = client.delete(
        reverse(API_GAMELOG, kwargs={"id": game.pk}),
        data=json.dumps({"sequence": 1}),
        content_type="application/json",
    )
    assert response.status_code == 200
    # A correction is in the log, so the projection is consistent, not flagged.
    assert check_one(game).ok
    assert GameEvent.objects.filter(game=game, type="correction").count() == 1
