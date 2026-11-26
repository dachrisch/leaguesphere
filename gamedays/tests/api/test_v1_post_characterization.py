"""Characterization of ``POST /api/gamelog/<id>`` before the shadow removal.

Pins the response, the rows/events it writes and its query count so the
removal of the shadow append can be proved behaviour-preserving for the v1
client (every change is confined to the declared feed/liveticker diffs).
"""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from gameevents.models import GameEvent, GameState
from gameevents.tests.api.support import legacy_body, login, make_game, post_legacy, sub_id
from gamedays.models import TeamLog

SUB_ID = sub_id(1)


@pytest.mark.django_db
def test_v1_post_rows_events_response_and_query_count(client):
    game, home, _away = make_game("char-v1-post")
    login(client)
    body = legacy_body(
        game,
        home,
        [{"name": "Touchdown", "player": "7"}],
        client_id=SUB_ID,
    )

    # 77 cold / 75 warm (the rules catalogue is cached across tests); both
    # are pinned so the removal must show a lower, stable count.
    with CaptureQueriesContext(connection) as captured:
        response = post_legacy(client, game, body)

    assert len(captured) in (75, 77)
    assert response.status_code == 201
    payload = response.json()
    assert payload["gameId"] == game.pk
    assert [row["event"] for row in payload["events"] if row.get("event")] == [
        "Touchdown"
    ]
    assert TeamLog.objects.filter(gameinfo=game).count() == 1
    event = GameEvent.objects.get(game=game)
    assert event.source == GameEvent.Source.LEGACY
    assert event.client_id == SUB_ID
    assert event.team_log_id is not None
    state = GameState.objects.get(game=game)
    assert (state.score_home, state.period, state.last_seq) == (6, 1, 1)


@pytest.mark.django_db
def test_v1_post_replay_writes_nothing(client, django_assert_num_queries):
    game, home, _away = make_game("char-v1-replay")
    login(client)
    body = legacy_body(
        game, home, [{"name": "Touchdown", "player": "7"}], client_id=SUB_ID
    )
    post_legacy(client, game, body)

    with django_assert_num_queries(24):
        response = post_legacy(client, game, body)

    assert response.status_code == 200
    assert TeamLog.objects.filter(gameinfo=game).count() == 1
    assert GameEvent.objects.filter(game=game).count() == 1
