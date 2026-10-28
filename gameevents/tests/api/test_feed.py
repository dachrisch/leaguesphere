"""The feed endpoint ``GET /api/game/<id>/feed`` (T4).

The contract under test:

- ``{state, events, cursor}`` for an event-sourced game, with ``after``
  filtering by ``seq``;
- ``ETag: "<last_seq>"`` and a ``304`` for a matching ``If-None-Match``, and a
  new event changes both the validator and the state;
- a legacy game (rows, no events) answers the *same* shape derived from
  ``TeamLog``/``Gameinfo`` with ``events: []`` and ``cursor: 0``;
- a flagged projection is never served as a score (409 with the flag);
- a game with neither rows nor events is a coherent 200, an unknown id a 404.
"""

import json
from datetime import time as clock_time

import pytest
from rest_framework.reverse import reverse

from gameevents.models import GameEvent, GameState
from gameevents.tests.api.support import (
    legacy_body,
    login,
    make_game,
    post_events,
    post_legacy,
)
from gamedays.constants import API_GAMELOG
from gamedays.models import TeamLog

FEED_URL = "api-game-feed"

TD = {"type": "score", "code": "touchdown", "side": "home", "player": 7, "period": 1}
PAT = {"type": "score", "code": "pat1", "side": "home", "player": 7, "period": 1}


def get_feed(client, game, after=None, **headers):
    url = reverse(FEED_URL, kwargs={"game_id": game.pk})
    params = {} if after is None else {"after": after}
    return client.get(url, params, **headers)


def submit(client, game, events, client_id="sub-1"):
    response = post_events(
        client,
        game,
        {"events": events, "client_id": client_id},
    )
    assert response.status_code == 201, response.content
    return response


def strip_events(game):
    """Turn a just-written game into a pre-log (legacy) one."""

    GameEvent.objects.filter(game=game).delete()
    GameState.objects.filter(game=game).delete()


@pytest.mark.django_db
def test_the_feed_reports_the_projected_state_and_the_events(client):
    game, _home, _away = make_game("feed-state")
    login(client)
    submit(client, game, [TD, PAT])

    response = get_feed(client, game)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"state", "events", "cursor"}
    assert body["state"] == {
        "score_home": 7,
        "score_away": 0,
        "period": 1,
        "in_possession": None,
        "last_seq": 2,
    }
    assert body["cursor"] == 2
    assert [event["seq"] for event in body["events"]] == [1, 2]
    assert body["events"][0] == {
        "seq": 1,
        "type": "score",
        "code": "touchdown",
        "side": "home",
        "player": 7,
        "period": 1,
        "payload": {},
        "client_id": "sub-1",
        "undo_of": None,
        "source": "v2",
    }


@pytest.mark.django_db
def test_after_returns_only_newer_events(client):
    game, _home, _away = make_game("feed-after")
    login(client)
    submit(client, game, [TD, PAT])
    submit(
        client,
        game,
        [
            {
                "type": "penalty",
                "code": "Holding",
                "side": "away",
                "player": 3,
                "period": 1,
            }
        ],
        client_id="sub-2",
    )

    body = get_feed(client, game, after=2).json()

    assert [event["seq"] for event in body["events"]] == [3]
    assert body["cursor"] == 3
    # The state is the game's, not the slice's.
    assert body["state"]["score_home"] == 7


@pytest.mark.django_db
def test_after_beyond_the_log_returns_no_events_and_the_last_cursor(client):
    game, _home, _away = make_game("feed-after-beyond")
    login(client)
    submit(client, game, [TD, PAT])

    body = get_feed(client, game, after=99).json()

    assert body["events"] == []
    assert body["cursor"] == body["state"]["last_seq"] == 2


@pytest.mark.django_db
def test_the_etag_is_the_last_seq_and_round_trips_to_304(client):
    game, _home, _away = make_game("feed-etag")
    login(client)
    submit(client, game, [TD, PAT])

    first = get_feed(client, game)

    assert first.status_code == 200
    assert first["ETag"] == '"2"'
    assert first["Cache-Control"] == "no-cache"

    second = get_feed(client, game, HTTP_IF_NONE_MATCH='"2"')

    assert second.status_code == 304
    assert second["ETag"] == '"2"'
    assert second.content == b""


@pytest.mark.django_db
def test_the_etag_accepts_a_weak_or_list_valued_if_none_match(client):
    game, _home, _away = make_game("feed-etag-weak")
    login(client)
    submit(client, game, [TD])

    response = get_feed(client, game, HTTP_IF_NONE_MATCH='"9", W/"1"')

    assert response.status_code == 304


@pytest.mark.django_db
def test_a_new_event_changes_the_etag_and_the_state(client):
    game, _home, _away = make_game("feed-etag-change")
    login(client)
    submit(client, game, [TD])
    old = get_feed(client, game)
    assert old["ETag"] == '"1"'
    assert old.json()["state"]["score_home"] == 6

    submit(client, game, [TD], client_id="sub-2")
    response = get_feed(client, game, after=1, HTTP_IF_NONE_MATCH=old["ETag"])

    assert response.status_code == 200
    assert response["ETag"] == '"2"'
    body = response.json()
    assert body["state"]["score_home"] == 12
    assert body["cursor"] == 2
    assert [event["seq"] for event in body["events"]] == [2]


@pytest.mark.django_db
def test_a_legacy_game_derives_the_same_state_from_its_rows(client):
    game, home, _away = make_game("feed-legacy")
    login(client)
    post_legacy(
        client,
        game,
        legacy_body(game, home, [{"name": "Touchdown", "player": "7"}], client_id="s"),
    )
    canonical = get_feed(client, game).json()["state"]
    strip_events(game)

    response = get_feed(client, game)

    assert response.status_code == 200
    body = response.json()
    assert body["events"] == []
    assert body["cursor"] == 0
    assert body["state"] == {
        "score_home": canonical["score_home"],
        "score_away": canonical["score_away"],
        "period": canonical["period"],
        "in_possession": canonical["in_possession"],
        "last_seq": 0,
    }


@pytest.mark.django_db
def test_a_legacy_game_reports_the_half_and_the_possession(client):
    game, home, _away = make_game("feed-legacy-half")
    login(client)
    post_legacy(
        client,
        game,
        legacy_body(game, home, [{"name": "Touchdown", "player": "7"}], half=2),
    )
    game.gameHalftime = clock_time(12, 0)
    game.in_possession = home.name
    game.save(update_fields=["gameHalftime", "in_possession"])
    strip_events(game)

    state = get_feed(client, game).json()["state"]

    assert state["period"] == 2
    assert state["in_possession"] == "home"


@pytest.mark.django_db
def test_a_finished_game_state_matches_its_rows(client):
    game, _home, _away = make_game("feed-finished")
    login(client)
    submit(client, game, [TD, PAT])
    submit(
        client,
        game,
        [{"type": "period", "code": "half_time", "side": None, "period": 2}],
        client_id="sub-half",
    )
    submit(
        client,
        game,
        [
            {
                "type": "score",
                "code": "touchdown",
                "side": "away",
                "player": 9,
                "period": 2,
            }
        ],
        client_id="sub-away",
    )
    submit(
        client,
        game,
        [{"type": "period", "code": "end", "side": None, "period": 2}],
        client_id="sub-end",
    )
    game.gameHalftime = clock_time(12, 0)
    game.save(update_fields=["gameHalftime"])
    canonical = get_feed(client, game).json()["state"]
    assert canonical["score_home"] == 7
    assert canonical["score_away"] == 6
    assert canonical["period"] == 2

    strip_events(game)

    legacy = get_feed(client, game).json()["state"]

    assert (legacy["score_home"], legacy["score_away"]) == (7, 6)
    assert legacy["period"] == canonical["period"]


@pytest.mark.django_db
def test_an_empty_game_answers_a_coherent_zero_state(client):
    game, _home, _away = make_game("feed-empty")

    response = get_feed(client, game)

    assert response.status_code == 200
    assert response.json() == {
        "state": {
            "score_home": 0,
            "score_away": 0,
            "period": 1,
            "in_possession": None,
            "last_seq": 0,
        },
        "events": [],
        "cursor": 0,
    }


@pytest.mark.django_db
def test_an_unknown_game_is_a_404(client):
    response = client.get(reverse(FEED_URL, kwargs={"game_id": 999999}))

    assert response.status_code == 404


@pytest.mark.django_db
def test_a_flagged_game_is_not_served_as_state(client):
    game, _home, _away = make_game("feed-flagged")
    login(client)
    submit(client, game, [TD])
    GameState.objects.filter(game=game).update(
        needs_reconciliation=True,
        reconciliation_note="undo of sequence 4 has no stored event",
    )

    response = get_feed(client, game)

    assert response.status_code == 409
    assert response.json()["needs_reconciliation"] is True
    assert "undo of sequence 4" in response.json()["detail"]
    # The flag is sticky even for a cursor query.
    assert get_feed(client, game, after=99).status_code == 409


@pytest.mark.django_db
def test_a_missing_projection_is_not_served_as_state(client):
    game, _home, _away = make_game("feed-no-projection")
    login(client)
    submit(client, game, [TD])
    GameState.objects.filter(game=game).delete()

    response = get_feed(client, game)

    assert response.status_code == 409
    assert response.json()["needs_reconciliation"] is True


@pytest.mark.django_db
def test_a_legacy_game_etag_changes_when_its_rows_change(client):
    game, home, _away = make_game("feed-legacy-etag")
    login(client)
    post_legacy(
        client,
        game,
        legacy_body(game, home, [{"name": "Touchdown", "player": "7"}], client_id="s"),
    )
    strip_events(game)
    before = get_feed(client, game)
    assert before.status_code == 200
    assert before.json()["state"]["score_home"] == 6

    row = TeamLog.objects.get(gameinfo=game, event="Touchdown")
    row.value = 0
    row.save(update_fields=["value"])

    response = get_feed(client, game, HTTP_IF_NONE_MATCH=before["ETag"])

    assert response.status_code == 200
    assert response.json()["state"]["score_home"] == 0
    assert response["ETag"] != before["ETag"]


@pytest.mark.django_db
def test_a_flagged_legacy_game_still_serves_its_rows(client):
    """The flag protects event-derived state, not a legacy game's rows.

    A legacy game has no event-derived score to be wrong about: its TeamLog
    rows are the record every consumer already reads. Answering 409 here would
    hide a score that is actually correct.
    """

    game, home, _away = make_game("feed-legacy-flagged")
    login(client)
    post_legacy(
        client,
        game,
        legacy_body(game, home, [{"name": "Touchdown", "player": "7"}], client_id="s"),
    )
    strip_events(game)
    GameState.objects.create(
        game=game,
        needs_reconciliation=True,
        reconciliation_note="undo of sequence 4 has no stored event",
    )

    response = get_feed(client, game)

    assert response.status_code == 200
    assert response.json()["state"]["score_home"] == 6
    assert response.json()["events"] == []


@pytest.mark.django_db
def test_after_must_be_a_non_negative_integer(client):
    game, _home, _away = make_game("feed-after-invalid")

    assert get_feed(client, game, after="soon").status_code == 400
    assert get_feed(client, game, after="-1").status_code == 400


@pytest.mark.django_db
def test_the_feed_is_readable_anonymously(client):
    game, _home, _away = make_game("feed-anon")
    login(client)
    submit(client, game, [TD])
    client.logout()

    assert get_feed(client, game).status_code == 200


@pytest.mark.django_db
def test_a_correction_is_carried_with_its_target_seq(client):
    game, _home, _away = make_game("feed-correction")
    login(client)
    submit(client, game, [TD])
    response = client.delete(
        reverse(API_GAMELOG, kwargs={"id": game.pk}),
        data=json.dumps({"sequence": 1}),
        content_type="application/json",
    )
    assert response.status_code == 200

    body = get_feed(client, game).json()

    assert [event["type"] for event in body["events"]] == ["score", "correction"]
    assert body["events"][-1]["undo_of"] == 1
    assert body["state"]["score_home"] == 0
