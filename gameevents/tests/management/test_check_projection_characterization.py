"""Characterization of ``check_game_projection`` before the Phase 2 report.

These tests pin the observable contract -- exact stdout, exit behaviour and
query counts -- so the additive ``--report`` option cannot change it. They run
against the original ``handle``/``_legacy_games`` implementation; the branch
coverage gate is checked against ``HEAD`` before any code is edited.
"""

from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from gameevents.models import GameState
from gameevents.tests.api.support import login, make_game, post_events, sub_id
from gamedays.models import TeamLog

TD = {"type": "score", "code": "touchdown", "side": "home", "player": 7, "period": 1}
PAT = {"type": "score", "code": "pat1", "side": "home", "player": 7, "period": 1}


def event_game(client, label):
    game, home, away = make_game(label)
    login(client)
    response = post_events(client, game, {"events": [TD, PAT], "client_id": sub_id(1)})
    assert response.status_code == 201, response.content
    return game, home, away


def legacy_game(label):
    game, home, _away = make_game(label)
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
    return game


@pytest.mark.django_db
def test_characterization_all_stdout_and_query_count(client, django_assert_num_queries):
    game, _home, _away = event_game(client, "char-all-event")
    legacy_game("char-all-legacy")

    out = StringIO()
    with django_assert_num_queries(6):
        call_command("check_game_projection", "--all", stdout=out)

    assert out.getvalue() == (
        f"game {game.pk}: ok (2 events, seq 2)\n"
        "checked 1 event-sourced game(s); skipped 1 legacy game(s) without events\n"
        "projection matches the event log\n"
    )


@pytest.mark.django_db
def test_characterization_all_with_no_games_has_an_empty_report_line(
    django_assert_num_queries,
):
    out = StringIO()
    with django_assert_num_queries(2):
        call_command("check_game_projection", "--all", stdout=out)

    assert out.getvalue() == (
        "checked 0 event-sourced game(s); skipped 0 legacy game(s) without events\n"
        "projection matches the event log\n"
    )


@pytest.mark.django_db
def test_characterization_single_game_stdout(client):
    game, _home, _away = event_game(client, "char-one-event")

    out = StringIO()
    call_command("check_game_projection", "--game", str(game.pk), stdout=out)

    assert out.getvalue() == (
        f"game {game.pk}: ok (2 events, seq 2)\n" "projection matches the event log\n"
    )


@pytest.mark.django_db
def test_characterization_single_legacy_game_stdout(django_assert_num_queries):
    game = legacy_game("char-one-legacy")

    out = StringIO()
    with django_assert_num_queries(5):
        call_command("check_game_projection", "--game", str(game.pk), stdout=out)

    assert out.getvalue() == (
        f"game {game.pk}: skipped (no events, legacy game)\n"
        f"game {game.pk} has no events; nothing to compare\n"
        "projection matches the event log\n"
    )


@pytest.mark.django_db
def test_characterization_drift_changes_exit_and_omits_success(client):
    game, _home, _away = event_game(client, "char-drift")
    TeamLog.objects.filter(gameinfo=game, event="Touchdown").update(value=0)

    out = StringIO()
    with pytest.raises(CommandError) as error:
        call_command("check_game_projection", "--game", str(game.pk), stdout=out)

    assert str(error.value) == (
        "1 game(s) with drift; run rebuild_game_projection --game <id>"
    )
    assert f"game {game.pk}: DRIFT at seq 1 (rows)" in out.getvalue()
    assert "projection matches the event log" not in out.getvalue()


@pytest.mark.django_db
def test_characterization_missing_game_is_a_command_error():
    out = StringIO()
    with pytest.raises(CommandError) as error:
        call_command("check_game_projection", "--game", "999999", stdout=out)

    assert str(error.value) == "No game found for gameId 999999"
    assert out.getvalue() == ""
