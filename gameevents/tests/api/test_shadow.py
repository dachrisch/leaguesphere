"""The legacy ``POST /api/gamelog/<id>`` after the Phase 2 shadow removal.

The v1 endpoint keeps writing ``TeamLog`` rows and answering with its log, but
it no longer records events: existing shadow events remain append-only audit
data, and only the canonical endpoint creates new events. The new v2 games
are read from their event projection; legacy games keep the row-based path.
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

SUB_ID = sub_id(1)


@pytest.mark.django_db
def test_v1_post_writes_rows_and_no_events(client):
    game, home, _away = make_game("legacy-no-shadow")
    login(client)

    response = post_legacy(
        client,
        game,
        legacy_body(
            game,
            home,
            [{"name": "Touchdown", "player": "7"}],
            client_id=SUB_ID,
        ),
    )

    assert response.status_code == 201
    assert TeamLog.objects.filter(gameinfo=game).count() == 1
    assert not GameEvent.objects.filter(game=game).exists()
    # The score still comes from the row the v1 writer stored.
    assert not GameState.objects.filter(game=game).exists()


@pytest.mark.django_db
def test_v1_replay_writes_no_more_rows(client):
    game, home, _away = make_game("legacy-replay")
    login(client)
    body = legacy_body(
        game, home, [{"name": "Touchdown", "player": "7"}], client_id=SUB_ID
    )

    first = post_legacy(client, game, body)
    second = post_legacy(client, game, body)

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json() == first.json()
    assert TeamLog.objects.filter(gameinfo=game).count() == 1
    assert not GameEvent.objects.filter(game=game).exists()


@pytest.mark.django_db
def test_v1_post_without_a_client_id_still_writes_rows(client):
    game, home, _away = make_game("legacy-no-client-id")
    login(client)

    response = post_legacy(
        client,
        game,
        legacy_body(game, home, [{"name": "Touchdown", "player": "7"}]),
    )

    assert response.status_code == 201
    assert TeamLog.objects.filter(gameinfo=game).count() == 1
    assert not GameEvent.objects.filter(game=game).exists()


@pytest.mark.django_db
def test_unknown_event_name_is_written_as_a_row_only(client):
    """The legacy writer no longer validates names through the event store."""

    game, home, _away = make_game("legacy-unknown-name")
    login(client)

    response = post_legacy(
        client,
        game,
        legacy_body(
            game, home, [{"name": "Unknown Play", "player": 7}], client_id=SUB_ID
        ),
    )

    assert response.status_code == 201
    assert TeamLog.objects.filter(gameinfo=game, event="Unknown Play").exists()
    assert not GameEvent.objects.filter(game=game).exists()
