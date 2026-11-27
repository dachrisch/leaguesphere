"""A manual result edit on a v2-owned game records a ``correction/result``.

``PATCH /api/gameinfo/<id>/result/`` writes ``Gameresult``. The liveticker and
the feed serve a v2-owned game from its ``GameState`` (ADR-0026), so without a
correction the public score stayed on the last scorecard score: v2 touchdown
6:0, PATCH 21:3, ticker still 6:0 -- and ``check_game_projection`` could not
see it, because the state still equalled the replay of the same log.
"""

import json
from dataclasses import replace

import pytest
from django.contrib.auth.models import User
from django.core.management import call_command
from rest_framework.exceptions import ValidationError
from rest_framework.reverse import reverse
from rest_framework.test import APIClient

from gameevents.api.serializers import parse_event_request
from gameevents.models import GameEvent, GameState
from gameevents.service.append import append_submission
from gameevents.service.projector import (
    GameStateValue,
    InvalidEnvelope,
    apply,
)
from gameevents.service.reconcile import check_games, rebuild_game
from gameevents.service.replay import resolve_correction
from gameevents.service.result import record_result_correction
from gameevents.tests.api.support import post_events
from gamedays.constants import API_GAMELOG
from gamedays.models import Gameresult, TeamLog
from gamedays.tests.setup_factories.factories import TeamLogFactory
from liveticker.service.liveticker_service import LivetickerService
from liveticker.tests.event_feed_support import event, make_live_game, submit


def _client(game):
    client = APIClient()
    client.force_authenticate(game.gameday.author)
    return client


def _patch_result(game, body):
    return _client(game).patch(
        f"/api/gamedays/gameinfo/{game.pk}/result/", body, format="json"
    )


def _totals(game):
    return {
        ("home" if result.isHome else "away"): (result.fh or 0) + (result.sh or 0)
        for result in Gameresult.objects.filter(gameinfo=game)
    }


def _ticker(game):
    payload = LivetickerService([], [], [game.gameday_id]).get_liveticker_as_json()
    return next(item for item in payload if item["gameId"] == game.pk)


def _feed(game):
    return APIClient().get(reverse("api-game-feed", kwargs={"game_id": game.pk})).json()


def _result_corrections(game):
    return list(
        GameEvent.objects.filter(game=game, type="correction", code="result").order_by(
            "seq"
        )
    )


@pytest.mark.django_db
def test_a_result_edit_on_a_v2_game_moves_the_projection_and_the_ticker():
    game, _home, _away = make_live_game("result-v2")
    submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")
    assert _ticker(game)["home"]["score"] == 6

    response = _patch_result(game, {"final_score": {"home": 21, "away": 3}})

    assert response.status_code == 200
    assert _totals(game) == {"home": 21, "away": 3}
    state = GameState.objects.get(game=game)
    assert (state.score_home, state.score_away) == (21, 3)
    ticker = _ticker(game)
    assert (ticker["home"]["score"], ticker["away"]["score"]) == (21, 3)

    [correction] = _result_corrections(game)
    assert correction.source == GameEvent.Source.STAFF
    assert correction.author == game.gameday.author
    assert correction.undo_of is None
    assert correction.payload == {
        "home": 21,
        "away": 3,
        "before": {"home": 6, "away": 0},
    }
    # The correction writes no row: the play-by-play stays what was recorded.
    assert not TeamLog.objects.filter(gameinfo=game, event="Touchdown").filter(
        isDeleted=True
    )

    feed = _feed(game)
    assert (feed["state"]["score_home"], feed["state"]["score_away"]) == (21, 3)
    last = feed["events"][-1]
    assert (last["type"], last["code"], last["source"]) == (
        "correction",
        "result",
        "staff",
    )
    assert last["seq"] == feed["state"]["last_seq"] == correction.seq


@pytest.mark.django_db
def test_check_game_projection_agrees_after_the_correction():
    game, _home, _away = make_live_game("result-check")
    submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")
    _patch_result(game, {"final_score": {"home": 21, "away": 3}})

    [check] = check_games([game.pk])
    assert check.ok, check.summary()
    # The command exits 0 (non-zero on drift).
    call_command("check_game_projection", "--game", str(game.pk))

    # A rebuild replays the correction too: the score stays the entered one.
    rebuild_game(game)
    state = GameState.objects.get(game=game)
    assert (state.score_home, state.score_away) == (21, 3)


@pytest.mark.django_db
def test_a_repeated_patch_records_one_correction():
    game, _home, _away = make_live_game("result-idempotent")
    submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")
    body = {
        "halftime_score": {"home": 14, "away": 3},
        "final_score": {"home": 21, "away": 3},
    }

    assert _patch_result(game, body).status_code == 200
    assert _patch_result(game, body).status_code == 200

    assert len(_result_corrections(game)) == 1
    state = GameState.objects.get(game=game)
    assert (state.score_home, state.score_away) == (21, 3)
    assert check_games([game.pk])[0].ok


@pytest.mark.django_db
def test_a_second_edit_records_a_second_correction_from_the_first():
    game, _home, _away = make_live_game("result-twice")
    submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")
    _patch_result(game, {"final_score": {"home": 21, "away": 3}})
    _patch_result(game, {"final_score": {"home": 20, "away": 3}})

    first, second = _result_corrections(game)
    assert second.payload["before"] == {"home": 21, "away": 3}
    state = GameState.objects.get(game=game)
    assert (state.score_home, state.score_away) == (20, 3)
    assert check_games([game.pk])[0].ok


@pytest.mark.django_db
def test_later_events_add_to_the_corrected_score():
    game, _home, _away = make_live_game("result-then-score")
    submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")
    _patch_result(game, {"halftime_score": {"home": 14, "away": 3}})
    state = GameState.objects.get(game=game)
    assert (state.score_home, state.score_away) == (14, 3)

    submit(game, [event("score", "touchdown", "away", 9)], client_id="s2")

    state = GameState.objects.get(game=game)
    assert (state.score_home, state.score_away) == (14, 9)
    assert _totals(game) == {"home": 14, "away": 9}
    assert check_games([game.pk])[0].ok


@pytest.mark.django_db
def test_a_result_edit_on_a_game_without_events_is_unchanged():
    game, home, _away = make_live_game("result-legacy")
    TeamLogFactory(
        gameinfo=game,
        team=home,
        event="Touchdown",
        value=6,
        sequence=1,
        half=1,
        author=game.gameday.author,
    )

    response = _patch_result(game, {"final_score": {"home": 21, "away": 3}})

    assert response.status_code == 200
    assert _totals(game) == {"home": 21, "away": 3}
    assert not GameEvent.objects.filter(game=game).exists()
    assert not GameState.objects.filter(game=game).exists()
    ticker = _ticker(game)
    assert (ticker["home"]["score"], ticker["away"]["score"]) == (21, 3)


@pytest.mark.django_db
def test_a_shadow_only_game_stays_legacy_on_a_result_edit():
    game, _home, _away = make_live_game("result-shadow")
    append_submission(
        game,
        [event("score", "touchdown", "home", 7)],
        client_id="shadow-1",
        source=GameEvent.Source.LEGACY,
        write_rows=True,
    )

    response = _patch_result(game, {"final_score": {"home": 21, "away": 3}})

    assert response.status_code == 200
    assert not _result_corrections(game)
    ticker = _ticker(game)
    assert (ticker["home"]["score"], ticker["away"]["score"]) == (21, 3)


@pytest.mark.django_db
def test_the_scorecard_cannot_post_a_result_correction(client):
    game, _home, _away = make_live_game("result-client")
    client.force_login(game.gameday.author)
    response = post_events(
        client,
        game,
        {
            "events": [
                {
                    "type": "correction",
                    "code": "result",
                    "payload": {"home": 99, "away": 0},
                }
            ]
        },
    )

    assert response.status_code == 400
    assert not GameEvent.objects.filter(game=game).exists()


@pytest.mark.django_db
def test_a_result_correction_cannot_be_undone_by_the_scorecard(client):
    game, _home, _away = make_live_game("result-undo")
    submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")
    # A halftime edit keeps the game running, so the endpoint reaches the
    # projector (a finished game is refused before it, with a 409).
    _patch_result(game, {"halftime_score": {"home": 21, "away": 3}})
    [correction] = _result_corrections(game)
    client.force_login(game.gameday.author)

    response = post_events(
        client,
        game,
        {
            "events": [
                {
                    "type": "correction",
                    "code": "undo",
                    "payload": {"undo_of": correction.seq},
                }
            ]
        },
    )

    assert response.status_code == 400
    assert "cannot be undone" in response.json()["detail"]
    state = GameState.objects.get(game=game)
    assert (state.score_home, state.score_away) == (21, 3)


# --------------------------------------------------------------------------
# projector: pure
# --------------------------------------------------------------------------


def test_the_projector_sets_the_score_from_a_result_correction():
    state = GameStateValue(score_home=6, score_away=0, period=2, last_seq=3)
    projection = apply(
        state,
        event(
            "correction",
            "result",
            period=2,
            payload={"home": 21, "away": 3, "before": {"home": 6, "away": 0}},
        ),
    )

    assert (projection.state.score_home, projection.state.score_away) == (21, 3)
    assert projection.state.period == 2
    assert projection.rows == []
    assert projection.deleted_sequences == projection.restored_sequences == []


@pytest.mark.parametrize(
    "payload",
    [{}, {"home": 1}, {"home": -1, "away": 0}, {"home": True, "away": 0}],
)
def test_the_projector_rejects_a_malformed_result_correction(payload):
    with pytest.raises(InvalidEnvelope):
        apply(GameStateValue(), event("correction", "result", payload=payload))


# --------------------------------------------------------------------------
# the remaining branches of the functions this change touches
# --------------------------------------------------------------------------


@pytest.mark.django_db
def test_a_stranger_cannot_edit_the_result():
    game, _home, _away = make_live_game("result-stranger")
    submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")
    stranger = User.objects.create_user(username="result-stranger", password="x")
    client = APIClient()
    client.force_authenticate(stranger)

    response = client.patch(
        f"/api/gamedays/gameinfo/{game.pk}/result/",
        {"final_score": {"home": 21, "away": 3}},
        format="json",
    )

    assert response.status_code == 403
    assert not _result_corrections(game)


@pytest.mark.django_db
def test_a_negative_result_on_a_v2_game_rolls_the_edit_back():
    game, _home, _away = make_live_game("result-negative")
    submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")

    response = _patch_result(game, {"final_score": {"home": -1, "away": 3}})

    assert response.status_code == 400
    assert "non-negative" in response.json()["detail"]
    assert _totals(game) == {"home": 6, "away": 0}
    assert not _result_corrections(game)


@pytest.mark.django_db
def test_a_game_without_both_results_records_no_correction():
    game, _home, _away = make_live_game("result-one-side")
    submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")
    Gameresult.objects.filter(gameinfo=game, isHome=False).delete()

    assert record_result_correction(game) is None
    assert not _result_corrections(game)


@pytest.mark.parametrize(
    "data",
    [
        [],
        {"event": [{"name": "Touchdown"}], "half": 1},
        {"events": []},
        {
            "client_id": "a",
            "events": [{"type": "score", "code": "touchdown", "client_id": "b"}],
        },
    ],
    ids=["not-an-object", "legacy-without-team", "no-events", "client-id-clash"],
)
def test_parse_event_request_rejects_malformed_bodies(data):
    with pytest.raises(ValidationError):
        parse_event_request(data)


def test_parse_event_request_takes_the_events_client_id():
    parsed = parse_event_request(
        {"events": [{"type": "score", "code": "touchdown", "client_id": "b"}]}
    )

    assert parsed.client_id == "b"


def test_a_correction_without_a_target_is_invalid():
    with pytest.raises(InvalidEnvelope):
        resolve_correction(
            event("correction", "undo", payload={"undo_of": 1}),
            rows_by_sequence={},
            seqs_by_client={},
        )


def test_a_play_target_without_its_sequence_is_a_service_bug():
    target = replace(event("score", "touchdown", "home", 7), seq=1)
    correction = replace(event("correction", "undo"), undo_of=target)

    with pytest.raises(ValueError, match="legacy_sequence"):
        apply(GameStateValue(score_home=6), correction)


# --------------------------------------------------------------------------
# after a manual result: the projection follows Gameresult's half floor
# --------------------------------------------------------------------------


def _state(game):
    state = GameState.objects.get(game=game)
    return state.score_home, state.score_away


def _undo_envelope(seq):
    return {
        "events": [{"type": "correction", "code": "undo", "payload": {"undo_of": seq}}]
    }


@pytest.mark.django_db
def test_an_undo_past_the_manual_result_follows_the_result_floor(client):
    # v2 TD 6:0, the official corrects the half to 0:0 by hand, then the
    # scorecard undoes the touchdown: Gameresult floors the half at 0, and the
    # projection must say 0 too, not -6.
    game, _home, _away = make_live_game("result-floor")
    submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")
    _patch_result(game, {"halftime_score": {"home": 0, "away": 0}})
    touchdown = GameEvent.objects.get(game=game, type="score")
    client.force_login(game.gameday.author)

    assert post_events(client, game, _undo_envelope(touchdown.seq)).status_code == 201

    assert _totals(game) == {"home": 0, "away": 0}
    assert _state(game) == (0, 0)
    follow = _result_corrections(game)[-1]
    assert follow.payload == {
        "home": 0,
        "away": 0,
        "before": {"home": -6, "away": 0},
        "reason": "follows_result",
    }
    assert TeamLog.objects.get(gameinfo=game, event="Touchdown").isDeleted
    assert check_games([game.pk])[0].ok
    ticker = _ticker(game)
    assert (ticker["home"]["score"], ticker["away"]["score"]) == (0, 0)


@pytest.mark.django_db
def test_a_legacy_delete_past_the_manual_result_follows_the_result_floor(client):
    game, _home, _away = make_live_game("result-floor-legacy")
    submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")
    _patch_result(game, {"halftime_score": {"home": 0, "away": 0}})
    sequence = TeamLog.objects.get(gameinfo=game, event="Touchdown").sequence
    client.force_login(game.gameday.author)

    response = client.delete(
        reverse(API_GAMELOG, kwargs={"id": game.pk}),
        data=json.dumps({"sequence": sequence}),
        content_type="application/json",
    )

    assert response.status_code == 200
    assert _totals(game) == {"home": 0, "away": 0}
    assert _state(game) == (0, 0)
    assert _result_corrections(game)[-1].payload["reason"] == "follows_result"
    assert check_games([game.pk])[0].ok


@pytest.mark.django_db
def test_an_undo_above_the_floor_needs_no_second_correction(client):
    game, _home, _away = make_live_game("result-no-floor")
    submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")
    _patch_result(game, {"halftime_score": {"home": 14, "away": 0}})
    touchdown = GameEvent.objects.get(game=game, type="score")
    client.force_login(game.gameday.author)

    assert post_events(client, game, _undo_envelope(touchdown.seq)).status_code == 201

    assert _totals(game) == {"home": 8, "away": 0}
    assert _state(game) == (8, 0)
    assert len(_result_corrections(game)) == 1
    assert check_games([game.pk])[0].ok


@pytest.mark.django_db
def test_a_game_without_a_manual_result_never_gets_a_follow_up():
    game, _home, _away = make_live_game("result-none")
    submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")
    # The table drifts on its own (no result edit in the log): the append
    # path leaves it to check_game_projection, as before.
    Gameresult.objects.filter(gameinfo=game, isHome=True).update(fh=40)

    submit(game, [event("score", "touchdown", "away", 9)], client_id="s2")

    assert not _result_corrections(game)
    assert _state(game) == (6, 6)


@pytest.mark.django_db
def test_a_log_that_cannot_record_the_result_answers_a_generic_400(monkeypatch):
    game, _home, _away = make_live_game("result-broken-log")
    submit(game, [event("score", "touchdown", "home", 7)], client_id="s1")

    def broken(*_args, **_kwargs):
        raise InvalidEnvelope("internal detail that must not leak")

    monkeypatch.setattr("gamedays.api.views.record_result_correction", broken)
    response = _patch_result(game, {"final_score": {"home": 21, "away": 3}})

    assert response.status_code == 400
    assert "event log" in response.json()["detail"]
    assert "internal detail" not in response.json()["detail"]
    assert _totals(game) == {"home": 6, "away": 0}
