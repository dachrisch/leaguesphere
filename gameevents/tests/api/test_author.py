"""Who caused a play: the event's actor, never the default user.

``TeamLog.author`` has ``default=1`` -- a user id that does not have to exist
(it is not a provisioned "system user"). Writing a projected row without an
author therefore worked on local SQLite only by accident (its first user gets
id 1) and failed on MySQL in CI (#2125). These tests pin the flow the
projection needs: ``request.user`` -> ``GameEvent.author`` ->
``TeamLogRow.author_id`` -> ``TeamLog.author``, the fallback for events that
genuinely have no actor, and the honest refusal when no user can be named at
all.
"""

import json
from unittest import mock

import pytest
from rest_framework.reverse import reverse

from gameevents.models import GameEvent
from gameevents.service.append import AuthorResolver, MissingAuthor, append_submission
from gameevents.service.projector import GameEventValue, InvalidEnvelope
from gameevents.tests.api.support import (
    legacy_body,
    login,
    make_game,
    post_events,
    post_legacy,
    sub_id,
)
from gamedays.constants import API_GAMELOG
from gamedays.models import TeamLog

TOUCHDOWN_ENVELOPE = {
    "type": "score",
    "code": "touchdown",
    "side": "home",
    "player": 7,
    "period": 1,
}


def touchdown(seq=1):
    """The projector's view of one touchdown, as a system write would send it."""

    return GameEventValue(
        type="score", code="touchdown", side="home", player=7, seq=seq
    )


def event_authors(game):
    return set(GameEvent.objects.filter(game=game).values_list("author_id", flat=True))


def row_authors(game):
    return set(
        TeamLog.objects.filter(gameinfo=game).values_list("author_id", flat=True)
    )


def delete_sequence(client, game, sequence):
    return client.delete(
        reverse(API_GAMELOG, kwargs={"id": game.pk}),
        data=json.dumps({"sequence": sequence}),
        content_type="application/json",
    )


@pytest.mark.django_db
def test_the_canonical_endpoint_records_the_request_user_as_the_author(client):
    game, _home, _away = make_game("author-canonical")
    user = login(client)

    response = post_events(
        client, game, {"events": [TOUCHDOWN_ENVELOPE], "client_id": sub_id(1)}
    )

    assert response.status_code == 201
    assert event_authors(game) == {user.pk}
    assert row_authors(game) == {user.pk}
    # The flow must not depend on a user happening to own the default id.
    assert user.pk != 1


@pytest.mark.django_db
def test_the_legacy_shadow_records_the_request_user_as_the_author(client):
    game, home, _away = make_game("author-shadow")
    user = login(client)

    response = post_legacy(
        client,
        game,
        legacy_body(
            game, home, [{"name": "Touchdown", "player": "7"}], client_id=sub_id(1)
        ),
    )

    assert response.status_code == 201
    # The legacy writer inserted the rows for the same request user; the event
    # log records the same actor instead of guessing one.
    assert event_authors(game) == {user.pk}
    assert row_authors(game) == {user.pk}


@pytest.mark.django_db
def test_a_legacy_undo_records_its_actor(client):
    game, home, _away = make_game("author-undo")
    user = login(client)
    post_legacy(
        client,
        game,
        legacy_body(
            game, home, [{"name": "Touchdown", "player": "7"}], client_id=sub_id(1)
        ),
    )

    assert delete_sequence(client, game, 1).status_code == 200

    correction = GameEvent.objects.get(game=game, type=GameEvent.Type.CORRECTION)
    assert correction.author_id == user.pk


@pytest.mark.django_db
def test_a_write_without_an_actor_uses_the_games_author():
    game, _home, _away = make_game("author-system")

    outcome = append_submission(
        game,
        [touchdown()],
        client_id="system-1",
        source=GameEvent.Source.STAFF,
        write_rows=True,
    )

    assert outcome.applied
    # The event honestly says "nobody": it is a system write, not a person.
    assert event_authors(game) == {None}
    # The row still needs a user, and the game's author is that user -- not
    # TeamLog's default id.
    assert row_authors(game) == {game.gameday.author_id}
    assert game.gameday.author_id != 1


@pytest.mark.django_db
def test_no_existing_user_is_a_client_error_not_a_database_error():
    game, _home, _away = make_game("author-missing")

    # No user row matches the ids the game names: the shape of a database whose
    # ``auth_user`` lost the row a default/foreign key still points at -- the
    # state MySQL rejects with an IntegrityError (#2125).
    with mock.patch.object(AuthorResolver, "exists", return_value=False):
        with pytest.raises(MissingAuthor) as error:
            append_submission(
                game,
                [touchdown()],
                client_id="system-1",
                source=GameEvent.Source.STAFF,
                write_rows=True,
            )

    assert "no author for the event" in str(error.value)
    # The endpoints map this to 400 {"detail": ...}, never to a 500.
    assert isinstance(error.value, InvalidEnvelope)
    # Nothing was written: the events and their rows are one transaction.
    assert not GameEvent.objects.filter(game=game).exists()
    assert not TeamLog.objects.filter(gameinfo=game).exists()


@pytest.mark.django_db
def test_an_actor_that_does_not_exist_is_refused():
    game, _home, _away = make_game("author-ghost")

    with pytest.raises(MissingAuthor) as error:
        append_submission(
            game,
            [touchdown()],
            client_id="ghost-1",
            source=GameEvent.Source.V2,
            write_rows=True,
            author=999999,
        )

    assert "no author for the event" in str(error.value)
    assert not GameEvent.objects.filter(game=game).exists()
