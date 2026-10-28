"""Shadow append on ``POST /api/gamelog/<id>`` (T3, transition safety).

The app keeps posting its unchanged payload. The legacy writer keeps writing
the ``TeamLog`` rows; in the same transaction the endpoint also records the
events those rows stand for. A failure to record must roll the rows back too:
the store may never hold events for rows that were not written.
"""

import pytest

from gameevents.models import GameEvent, GameState
from gameevents.tests.api.support import (
    db_row_signatures,
    legacy_body,
    login,
    make_game,
    post_legacy,
)
from gameevents.tests.golden_cases import GOLDEN_CASES, expected_signature
from gamedays.models import TeamLog

TOUCHDOWN_PAT = next(case for case in GOLDEN_CASES if case.name == "touchdown_pat1")


@pytest.mark.django_db
def test_the_shadow_records_the_events_of_the_unchanged_payload(client):
    game, home, _away = make_game("shadow")
    login(client)

    body = legacy_body(
        game,
        home,
        [{"name": "Touchdown", "player": "7"}, {"name": "1-Extra-Punkt", "player": "7"}],
        client_id="submission-1",
    )
    response = post_legacy(client, game, body)

    assert response.status_code == 201
    # The rows are exactly what the legacy writer produced before the shadow
    # existed -- the shadow did not write them a second time.
    assert db_row_signatures(game, home) == expected_signature(TOUCHDOWN_PAT)
    assert TeamLog.objects.filter(gameinfo=game).count() == 2

    events = list(GameEvent.objects.filter(game=game).order_by("seq"))
    assert [(e.seq, e.type, e.code, e.side, e.player) for e in events] == [
        (1, "score", "touchdown", "home", 7),
        (2, "score", "pat1", "home", 7),
    ]
    assert {e.client_id for e in events} == {"submission-1"}
    assert all(e.source == GameEvent.Source.LEGACY for e in events)
    assert {e.legacy_sequence for e in events} == {1}
    # GameState is the event projection, so the feed and reconciliation agree.
    state = GameState.objects.get(game=game)
    assert (state.score_home, state.score_away, state.period, state.last_seq) == (
        7,
        0,
        1,
        2,
    )


@pytest.mark.django_db
def test_a_replay_of_the_same_submission_writes_neither_rows_nor_events(client):
    game, home, _away = make_game("shadow-replay")
    login(client)
    body = legacy_body(
        game, home, [{"name": "Touchdown", "player": "7"}], client_id="submission-1"
    )

    assert post_legacy(client, game, body).status_code == 201
    response = post_legacy(client, game, body)

    assert response.status_code == 200
    assert GameEvent.objects.filter(game=game).count() == 1
    assert TeamLog.objects.filter(gameinfo=game).count() == 1


@pytest.mark.django_db
def test_a_payload_without_a_client_id_is_still_recorded(client):
    game, home, _away = make_game("shadow-anon")
    login(client)

    response = post_legacy(
        client, game, legacy_body(game, home, [{"name": "Touchdown", "player": "7"}])
    )

    assert response.status_code == 201
    assert GameEvent.objects.filter(game=game).count() == 1
    assert GameEvent.objects.get(game=game).client_id


@pytest.mark.django_db
def test_an_append_failure_rolls_the_legacy_rows_back(client, monkeypatch):
    game, home, _away = make_game("shadow-failure")
    login(client)

    def boom(*args, **kwargs):
        raise RuntimeError("event store unavailable")

    monkeypatch.setattr("gamedays.api.game_views.shadow_append", boom)
    client.raise_request_exception = False

    response = post_legacy(
        client,
        game,
        legacy_body(
            game,
            home,
            [{"name": "Touchdown", "player": "7"}],
            client_id="submission-1",
        ),
    )

    assert response.status_code == 500
    assert TeamLog.objects.filter(gameinfo=game).count() == 0
    assert GameEvent.objects.filter(game=game).count() == 0


@pytest.mark.django_db
def test_an_unknown_event_name_is_rejected_and_nothing_is_written(client):
    game, home, _away = make_game("shadow-unknown")
    login(client)

    response = post_legacy(
        client,
        game,
        legacy_body(game, home, [{"name": "Tor"}], client_id="submission-1"),
    )

    assert response.status_code == 400
    assert TeamLog.objects.filter(gameinfo=game).count() == 0
    assert GameEvent.objects.filter(game=game).count() == 0


@pytest.mark.django_db
def test_the_gamelog_response_body_is_unchanged(client):
    # The old app consumes this body; the shadow must not touch it.
    game, home, _away = make_game("shadow-body")
    login(client)

    response = post_legacy(
        client,
        game,
        legacy_body(
            game,
            home,
            [
                {"name": "Touchdown", "player": "7"},
                {"name": "1-Extra-Punkt", "player": "7"},
            ],
        ),
    )

    assert response.status_code == 201
    assert response.json()["home"]["score"] == 7
    assert response.json()["home"]["firsthalf"]["entries"] == [
        {"pat1": 7, "sequence": 1, "td": 7}
    ]


@pytest.mark.django_db
def test_the_shadow_needs_authentication(client):
    game, home, _away = make_game("shadow-anon-denied")

    response = post_legacy(
        client, game, legacy_body(game, home, [{"name": "Touchdown", "player": "7"}])
    )

    assert response.status_code in (401, 403)
    assert GameEvent.objects.count() == 0
    assert TeamLog.objects.count() == 0
