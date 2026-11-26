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
    post_events,
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
def test_a_v1_submission_retried_on_the_canonical_endpoint_writes_nothing(client):
    """One outbox, two endpoints: the claim must not live in only one of them.

    With the shadow gone, ``GameEvent.client_id`` alone cannot see a v1
    submission. The canonical endpoint must check ``GameLogSubmission`` too or
    a retry after the app switches endpoints records the same play twice.
    """

    game, home, _away = make_game("cross-endpoint-replay")
    login(client)
    body = legacy_body(
        game, home, [{"name": "Touchdown", "player": "7"}], client_id=SUB_ID
    )
    first = post_legacy(client, game, body)
    assert first.status_code == 201

    retry = post_events(client, game, body)

    assert retry.status_code == 200
    assert retry.json()["state"]["score_home"] == 6
    assert TeamLog.objects.filter(gameinfo=game).count() == 1
    assert not GameEvent.objects.filter(game=game).exists()


@pytest.mark.django_db
def test_a_v1_write_to_a_v2_owned_game_is_refused_without_rows(client):
    game, home, _away = make_game("mixed-v2-first")
    login(client)
    assert (
        post_events(
            client,
            game,
            legacy_body(
                game, home, [{"name": "Touchdown", "player": 7}], client_id=sub_id(2)
            ),
        ).status_code
        == 201
    )

    response = post_legacy(
        client,
        game,
        legacy_body(
            game, home, [{"name": "Touchdown", "player": 7}], client_id=sub_id(3)
        ),
    )

    assert response.status_code == 409
    assert TeamLog.objects.filter(gameinfo=game).count() == 1
    assert GameEvent.objects.filter(game=game).count() == 1


@pytest.mark.django_db
def test_a_canonical_write_after_v1_rows_does_not_reuse_their_sequence(client):
    game, home, _away = make_game("mixed-legacy-first")
    login(client)
    assert (
        post_legacy(
            client,
            game,
            legacy_body(
                game, home, [{"name": "Touchdown", "player": 7}], client_id=sub_id(2)
            ),
        ).status_code
        == 201
    )

    response = post_events(
        client,
        game,
        legacy_body(
            game, home, [{"name": "Touchdown", "player": 7}], client_id=sub_id(3)
        ),
    )

    assert response.status_code == 201
    assert GameEvent.objects.get(game=game).seq == 2
    assert sorted(
        TeamLog.objects.filter(gameinfo=game).values_list("sequence", flat=True)
    ) == [1, 2]
    # No backfill: GameState replays only stored events, so it cannot count
    # the pre-log row. check_game_projection reports that drift; the fix here
    # is that the two writers no longer collide on the same sequence number.
    assert response.json()["state"]["score_home"] == 6


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
def test_unknown_event_name_is_rejected_without_writing_rows(client):
    """The v1 endpoint keeps the legacy name table's 400 contract.

    The shadow is gone, but validation is not: the view shares the projector's
    ``LEGACY_EVENTS`` table, so an unknown name still answers 400 and writes
    nothing. Removing that would be an undeclared client-visible change.
    """

    game, home, _away = make_game("legacy-unknown-name")
    login(client)

    response = post_legacy(
        client,
        game,
        legacy_body(
            game, home, [{"name": "Unknown Play", "player": 7}], client_id=SUB_ID
        ),
    )

    assert response.status_code == 400
    assert not TeamLog.objects.filter(gameinfo=game).exists()
    assert not GameEvent.objects.filter(game=game).exists()
