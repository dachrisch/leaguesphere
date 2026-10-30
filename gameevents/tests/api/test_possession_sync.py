"""The projected possession reaches ``Gameinfo.in_possession``.

The v2 field app writes possession as an event only. ``GET /api/gamelog/<id>``
(the payload every scorecard, the liveticker and a reopened game read) still
answers ``inPossession`` from ``Gameinfo.in_possession``, which only the legacy
``PUT /possession`` used to set -- so a reopened or second device saw no ball.
The append now mirrors a possession the submission *changed* onto ``Gameinfo``
as the team name, the convention the legacy write path uses.
"""

import json

import pytest
from rest_framework.reverse import reverse

from gameevents.tests.api.support import login, make_game, post_events, sub_id
from gamedays.constants import API_GAMELOG
from gamedays.models import Gameinfo


def possession(code, n):
    return {
        "events": [{"type": "possession", "code": code, "period": 1}],
        "client_id": sub_id(n),
    }


def gamelog_possession(client, game):
    response = client.get(reverse(API_GAMELOG, kwargs={"id": game.pk}))
    assert response.status_code == 200
    return json.loads(response.content)["inPossession"]


@pytest.mark.django_db
def test_a_possession_event_reaches_the_gamelog_payload(client):
    game, home, _away = make_game("sync-home")
    login(client)

    assert post_events(client, game, possession("home", 1)).status_code == 201

    game.refresh_from_db()
    assert game.in_possession == home.name
    assert gamelog_possession(client, game) == home.name


@pytest.mark.django_db
def test_a_later_possession_event_moves_it_to_the_other_team(client):
    game, _home, away = make_game("sync-flip")
    login(client)

    post_events(client, game, possession("home", 1))
    post_events(client, game, possession("away", 2))

    assert gamelog_possession(client, game) == away.name


@pytest.mark.django_db
def test_undoing_the_opening_possession_clears_it_again(client):
    game, _home, _away = make_game("sync-undo")
    login(client)
    post_events(client, game, possession("home", 1))

    response = post_events(
        client,
        game,
        {
            "events": [
                {"type": "correction", "code": "undo", "payload": {"undo_of": 1}}
            ],
            "client_id": sub_id(2),
        },
    )

    assert response.status_code == 201
    assert response.json()["state"]["in_possession"] is None
    assert Gameinfo.objects.get(pk=game.pk).in_possession is None


@pytest.mark.django_db
def test_an_event_that_does_not_touch_possession_keeps_a_legacy_value(client):
    """A v1 game holds its possession on ``Gameinfo`` only (``PUT /possession``);
    an append that never changes the projected possession must not wipe it."""

    game, home, _away = make_game("sync-legacy")
    game.in_possession = home.name
    game.save(update_fields=["in_possession"])
    login(client)

    response = post_events(
        client,
        game,
        {
            "events": [
                {"type": "series", "code": "first_down", "side": "home", "period": 1}
            ],
            "client_id": sub_id(1),
        },
    )

    assert response.status_code == 201
    assert Gameinfo.objects.get(pk=game.pk).in_possession == home.name
