"""The legacy ``POST /api/gamelog/<id>`` after the Phase 2 shadow removal.

The v1 endpoint keeps writing ``TeamLog`` rows and answering with its log, but
it no longer records events: existing shadow events remain append-only audit
data, and only the canonical endpoint creates new events. The new v2 games
are read from their event projection; legacy games keep the row-based path.
"""

import pytest
from django.utils import timezone

from gameevents.api.views import V1_OWNED_DETAIL
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
from gamedays.service.game_service import GameService

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


def _v1_touchdown(client, game, home, number):
    response = post_legacy(
        client,
        game,
        legacy_body(
            game,
            home,
            [{"name": "Touchdown", "player": 7}],
            client_id=sub_id(number),
        ),
    )
    assert response.status_code == 201
    return response


@pytest.mark.django_db
def test_a_canonical_write_to_a_game_started_on_the_old_app_is_refused(client):
    """Mirror of the v2-owned 409: the old app owns a game it started.

    Without the shadow the v1 play has no event, so accepting the canonical
    write would leave a ``GameState`` of 6 after two touchdowns, which neither
    the feed nor ``check_game_projection`` could detect. Refuse it instead;
    nothing is written and the old app can keep scoring the game.
    """

    game, home, _away = make_game("mixed-legacy-first")
    login(client)
    _v1_touchdown(client, game, home, 2)

    response = post_events(
        client,
        game,
        legacy_body(
            game, home, [{"name": "Touchdown", "player": 7}], client_id=sub_id(3)
        ),
    )

    assert response.status_code == 409
    assert response.json() == {"detail": V1_OWNED_DETAIL}
    assert not GameEvent.objects.filter(game=game).exists()
    assert not GameState.objects.filter(game=game).exists()
    assert TeamLog.objects.filter(gameinfo=game).count() == 1
    # The old app still owns the game and keeps writing it.
    _v1_touchdown(client, game, home, 4)
    assert sorted(
        TeamLog.objects.filter(gameinfo=game).values_list("sequence", flat=True)
    ) == [1, 2]


@pytest.mark.django_db
def test_a_game_with_shadow_events_but_no_v2_event_is_still_old_app_owned(client):
    """Shadow events from before the removal do not hand a game to v2.

    v1 plays after the deploy have no event, so the shadow log is incomplete
    from then on; the same refusal applies.
    """

    game, home, _away = make_game("mixed-shadow-first")
    login(client)
    _v1_touchdown(client, game, home, 5)
    # The audit event the shadow wrote for that play before this release.
    GameEvent.objects.create(
        game=game,
        seq=1,
        type="score",
        code="touchdown",
        side="home",
        player=7,
        period=1,
        payload={},
        client_id=str(sub_id(5)),
        source=GameEvent.Source.LEGACY,
        client_at=timezone.now(),
    )

    response = post_events(
        client,
        game,
        legacy_body(
            game, home, [{"name": "Touchdown", "player": 7}], client_id=sub_id(7)
        ),
    )

    assert response.status_code == 409
    assert not GameEvent.objects.filter(game=game, source="v2").exists()


@pytest.mark.django_db
def test_a_canonical_write_after_only_deleted_v1_rows_does_not_reuse_their_sequence(
    client,
):
    game, home, _away = make_game("mixed-legacy-deleted")
    login(client)
    _v1_touchdown(client, game, home, 8)
    TeamLog.objects.filter(gameinfo=game).update(isDeleted=True)

    response = post_events(
        client,
        game,
        legacy_body(
            game, home, [{"name": "Touchdown", "player": 7}], client_id=sub_id(9)
        ),
    )

    # A deleted play leaves nothing for the state to miss, so v2 may take the
    # game -- without colliding with the deleted row's sequence number.
    assert response.status_code == 201
    assert GameEvent.objects.get(game=game).seq == 2
    assert sorted(
        TeamLog.objects.filter(gameinfo=game).values_list("sequence", flat=True)
    ) == [1, 2]
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


@pytest.mark.django_db
def test_a_game_started_for_v2_is_not_old_app_owned_by_its_start_marker(client):
    """Starting a game writes a ``Spiel gestartet`` row for either app.

    That marker is not an old-app play: the v2 app's first canonical write
    (the opening possession) right after the start must be accepted.
    """

    game, home, _away = make_game("v2-start-marker")
    login(client)
    GameService(game.pk).update_gamestart(game.gameday.author)
    assert TeamLog.objects.filter(gameinfo=game, event="Spiel gestartet").exists()

    response = post_events(
        client,
        game,
        legacy_body(
            game, home, [{"name": "Touchdown", "player": 7}], client_id=sub_id(10)
        ),
    )

    assert response.status_code == 201
    assert GameEvent.objects.filter(game=game, source="v2").count() == 1
