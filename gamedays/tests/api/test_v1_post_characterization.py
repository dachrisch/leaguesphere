"""Post-removal characterization of ``POST /api/gamelog/<id>``.

Pins the response, the rows it writes and its **exact** query count after the
shadow removal. The pre-removal pin lives next to this file in
``test_v1_post_pre_removal_characterization.py``; together they show the
query reduction and the event/GameState change in the final diff.
"""

import pytest

from gameevents.models import GameEvent, GameState
from gameevents.tests.api.support import (
    legacy_body,
    login,
    make_game,
    post_legacy,
    sub_id,
)
from gamedays.models import TeamLog
from gamedays.tests.setup_factories.request_caches import pin_request_path_caches

SUB_ID = sub_id(1)


@pytest.mark.django_db
def test_after_removal_v1_post_rows_no_events_and_exact_query_count(
    client, django_assert_num_queries
):
    game, home, _away = make_game("char-after-removal")
    login(client)
    body = legacy_body(
        game,
        home,
        [{"name": "Touchdown", "player": "7"}],
        client_id=SUB_ID,
    )

    # Cache warm-up (site config / rules catalogue) makes the count exact:
    # 55 = the pre-removal 77/75 minus the shadow append, plus the v2-owned
    # guard. Process-level request-path caches must be pinned for stability.
    pin_request_path_caches()
    with django_assert_num_queries(55):
        response = post_legacy(client, game, body)

    assert response.status_code == 201
    payload = response.json()
    assert payload["gameId"] == game.pk
    assert [row["event"] for row in payload["events"] if row.get("event")] == [
        "Touchdown"
    ]
    assert TeamLog.objects.filter(gameinfo=game).count() == 1
    assert not GameEvent.objects.filter(game=game).exists()
    assert not GameState.objects.filter(game=game).exists()


@pytest.mark.django_db
def test_after_removal_v1_post_replay_writes_nothing(client, django_assert_num_queries):
    game, home, _away = make_game("char-after-removal-replay")
    login(client)
    body = legacy_body(
        game, home, [{"name": "Touchdown", "player": "7"}], client_id=SUB_ID
    )
    post_legacy(client, game, body)

    with django_assert_num_queries(24):
        response = post_legacy(client, game, body)

    assert response.status_code == 200
    assert TeamLog.objects.filter(gameinfo=game).count() == 1
    assert not GameEvent.objects.filter(game=game).exists()
