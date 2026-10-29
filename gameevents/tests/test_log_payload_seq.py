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
def test_a_canonical_submission_publishes_its_group_seq(client):
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
    # One submission is one row group: both rows name the group's first seq, so
    # undoing either removes the touchdown and its conversion together.
    assert rows["Touchdown"]["seq"] == 1
    assert rows["1-Extra-Punkt"]["seq"] == 1
    assert rows["Touchdown"]["sequence"] == 1


@pytest.mark.django_db
def test_a_shadow_submission_publishes_the_event_seq_not_the_legacy_sequence(client):
    login(client)
    game, home, _away = make_game("seq")

    # The legacy writer allocates TeamLog.sequence = max+1, so after one write
    # the shadow's rows are sequence 1 while its events start at seq 1 as well.
    post_legacy(
        client,
        game,
        legacy_body(game, home, [{"name": "Touchdown", "player": 7}], client_id=sub_id(1)),
    )
    # A canonical submission afterwards takes seq 2 but is projected into the
    # sequence the log allocated (min seq = 2) -- the two schemes still agree.
    post_events(
        client,
        game,
        {
            "events": [
                {"type": "score", "code": "touchdown", "side": "away", "player": 9}
            ],
            "client_id": sub_id(2),
        },
    )

    payload = get_log(client, game).json()
    rows = sorted(payload["events"], key=lambda event: event["id"])
    assert [(row["sequence"], row["seq"]) for row in rows] == [(1, 1), (2, 2)]


@pytest.mark.django_db
def test_a_penalty_keeps_seq_null_because_sequence_zero_is_shared(client):
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

    assert penalty["sequence"] == 0
    assert penalty["seq"] is None
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
