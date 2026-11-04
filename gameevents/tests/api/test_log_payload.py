"""The gamelog payload publishes each row's structured event payload.

The scorecard derives the down & distance from the plays, and the row text is
not enough for that: it needs the structured ``yards``. The payload is additive
— a row no event wrote keeps ``payload: null`` — so the old app and the
snapshot keep working unchanged.
"""

import json

import pytest
from rest_framework.reverse import reverse

from gameevents.tests.api.support import login, make_game, post_events, sub_id
from gamedays.constants import API_GAMELOG


def play(n):
    return {
        "events": [
            {
                "type": "play",
                "code": "pass",
                "side": "home",
                "player": 7,
                "period": 1,
                "payload": {
                    "input": "8 Yards · QB #12",
                    "yards": 8,
                    "complete": True,
                    "qb": 12,
                },
            }
        ],
        "client_id": sub_id(n),
    }


def event_payloads(client, game):
    response = client.get(reverse(API_GAMELOG, kwargs={"id": game.pk}))
    assert response.status_code == 200
    return [
        (row["event"], row["payload"]) for row in json.loads(response.content)["events"]
    ]


@pytest.mark.django_db
def test_a_play_row_publishes_its_structured_payload(client):
    game, _home, _away = make_game("payload-play")
    login(client)

    assert post_events(client, game, play(1)).status_code == 201

    rows = event_payloads(client, game)
    assert rows == [
        (
            "Pass",
            {
                "input": "8 Yards · QB #12",
                "yards": 8,
                "complete": True,
                "qb": 12,
            },
        )
    ]


@pytest.mark.django_db
def test_a_row_without_an_event_has_no_payload(client):
    game, _home, _away = make_game("payload-empty")
    login(client)

    # Nothing was appended: the events list is empty, and the scoring entries
    # fall back to the old payload shape.
    assert event_payloads(client, game) == []
