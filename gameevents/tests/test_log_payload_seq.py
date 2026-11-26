"""The log payload's ``seq``: the handle a correction names.

``GET /api/gamelog/<id>`` has to tell a client which event produced a row,
because an undo is ``{"type": "correction", "payload": {"undo_of": <seq>}}``.
The field is additive -- old readers ignore it -- and it is only set where it
names one row group: sequence 0 (penalties, clocks, markers) is shared by every
such submission and stays ``null``, exactly the rows the client still undoes by
``team_log_id``.
"""

from http import HTTPStatus

import pytest
from rest_framework.reverse import reverse

from gamedays.constants import API_GAMELOG
from gameevents.tests.api.support import (
    legacy_body,
    login,
    make_game,
    post_events,
    post_legacy,
    sub_id,
)


def get_log(client, game):
    return client.get(reverse(API_GAMELOG, kwargs={"id": game.pk}))


def events_by_name(payload):
    return {event["event"]: event for event in payload["events"]}


@pytest.mark.django_db
def test_a_canonical_submission_publishes_the_seq_of_each_row(client):
    login(client)
    game, home, _away = make_game("seq")

    post_events(
        client,
        game,
        {
            "events": [
                {"type": "score", "code": "touchdown", "side": "home", "player": 7},
                {"type": "score", "code": "pat1", "side": "home", "player": 7},
            ],
            "client_id": sub_id(1),
        },
    )

    payload = get_log(client, game).json()
    rows = events_by_name(payload)
    # Every row names the event that wrote it; the two events are one
    # submission, so a correction naming either removes both.
    assert rows["Touchdown"]["seq"] == 1
    assert rows["1-Extra-Punkt"]["seq"] == 2
    assert rows["Touchdown"]["sequence"] == 1
    assert rows["1-Extra-Punkt"]["sequence"] == 1


@pytest.mark.django_db
def test_a_penalty_names_its_own_event_although_sequence_zero_is_shared(client):
    login(client)
    game, home, _away = make_game("seq")

    post_events(
        client,
        game,
        {
            "events": [
                {"type": "penalty", "code": "Holding", "side": "home", "player": 23}
            ],
            "client_id": sub_id(1),
        },
    )

    payload = get_log(client, game).json()
    penalty = next(event for event in payload["events"] if event["event"] == "Strafe")

    # Sequence 0 cannot name a row (every penalty/clock/marker shares it), so
    # the row is addressed by the event that wrote it.
    assert penalty["sequence"] == 0
    assert penalty["seq"] == 1
    assert penalty["id"] > 0


@pytest.mark.django_db
def test_a_legacy_game_without_events_has_no_seq(client):
    login(client)
    game, home, _away = make_game("seq")

    post_legacy(
        client,
        game,
        legacy_body(game, home, [{"name": "Touchdown", "player": 7}]),
    )
    # Drop the events: this is a game the pre-slice-1 app wrote, i.e. what an
    # unmigrated gameday still looks like.
    game.events.all().delete()

    payload = get_log(client, game).json()
    touchdown = next(
        event for event in payload["events"] if event["event"] == "Touchdown"
    )

    assert touchdown["sequence"] == 1
    assert touchdown["seq"] is None
