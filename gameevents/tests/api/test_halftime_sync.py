"""The projected halftime reaches ``Gameinfo``.

The v2 field app writes the halftime as a ``period/half_time`` event only.
``GET /api/gamelog/<id>`` -- what a reopened scorecard, the game list and every
other consumer read -- answers ``isFirstHalf`` from ``Gameinfo.gameHalftime``,
which only the legacy ``PUT /halftime`` used to set. Without the mirror the
half never flips for an event-written game: the tracking screen keeps offering
"Halbzeit", keeps reading "1. Halbzeit", and files every play of the second
half under half 1.

The append now mirrors the projected period onto ``Gameinfo`` the same way
:func:`gameevents.service.append._sync_possession` mirrors possession -- once,
with the timestamp the first half-time event produced.
"""

import json

import pytest
from rest_framework.reverse import reverse

from gameevents.tests.api.support import login, make_game, post_events, sub_id
from gamedays.constants import API_GAMELOG
from gamedays.models import Gameinfo


def halftime(n):
    return {
        "events": [{"type": "period", "code": "half_time", "period": 2}],
        "client_id": sub_id(n),
    }


def touchdown(side, period, n):
    return {
        "events": [
            {
                "type": "score",
                "code": "touchdown",
                "side": side,
                "player": 7,
                "period": period,
            }
        ],
        "client_id": sub_id(n),
    }


def gamelog(client, game):
    response = client.get(reverse(API_GAMELOG, kwargs={"id": game.pk}))
    assert response.status_code == 200
    return json.loads(response.content)


@pytest.mark.django_db
def test_a_halftime_event_flips_the_game_and_the_log_to_the_second_half(client):
    game, _home, _away = make_game("sync-halftime")
    login(client)

    assert post_events(client, game, halftime(1)).status_code == 201

    game.refresh_from_db()
    assert game.gameHalftime is not None
    assert game.status == "2. Halbzeit"
    assert gamelog(client, game)["isFirstHalf"] is False


@pytest.mark.django_db
def test_a_later_write_keeps_the_halftime_timestamp(client):
    """The mirror runs on the projected period, not on "this event is a marker":
    a second-half play must not move the half-time clock again."""

    game, _home, _away = make_game("sync-halftime-stable")
    login(client)

    post_events(client, game, halftime(1))
    game.refresh_from_db()
    halftime_at = game.gameHalftime

    assert post_events(client, game, touchdown("home", 2, 2)).status_code == 201

    game.refresh_from_db()
    assert game.gameHalftime == halftime_at
    assert game.status == "2. Halbzeit"


@pytest.mark.django_db
def test_a_second_half_play_is_filed_in_the_second_half(client):
    """The log's halves follow the marker, so the screen's half (and the score a
    play changes) is the second one as soon as the halftime landed."""

    game, _home, _away = make_game("sync-halftime-entries")
    login(client)

    post_events(client, game, halftime(1))
    post_events(client, game, touchdown("home", 2, 2))

    payload = gamelog(client, game)
    assert payload["home"]["firsthalf"]["score"] == 0
    assert payload["home"]["secondhalf"]["score"] == 6
    assert Gameinfo.objects.get(pk=game.pk).gameHalftime is not None
