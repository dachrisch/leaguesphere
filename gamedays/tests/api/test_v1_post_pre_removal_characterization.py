"""Pre-removal characterization of ``POST /api/gamelog/<id>``.

Verbatim from commit `41e9d664e`: 75/77 queries, a legacy-sourced event with
its row link and GameState. It runs at the characterization commit (before the
shadow is removed) and is skipped at the stack head, where the code path no
longer exists, so the pre-removal pin stays visible next to the new one.
"""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

import gamedays.api.game_views as game_views
from gameevents.models import GameEvent, GameState
from gameevents.tests.api.support import (
    legacy_body,
    login,
    make_game,
    post_legacy,
    sub_id,
)
from gamedays.models import TeamLog

pytestmark = pytest.mark.skipif(
    not hasattr(game_views, "shadow_append"),
    reason="pre-removal characterization: run at 41e9d664e, before the shadow removal",
)


@pytest.mark.django_db
def test_before_removal_v1_post_rows_events_response_and_query_count(client):
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
def test_before_removal_v1_post_replay_writes_nothing(
    client, django_assert_num_queries
):
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
