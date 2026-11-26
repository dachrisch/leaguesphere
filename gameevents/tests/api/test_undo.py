"""A legacy undo is recorded in the log (T3).

``DELETE /api/gamelog/<id>`` is the app's only undo and the v2 app's per-entry
undo reaches the same endpoint. It deletes rows; without an event the
projection would keep a score the rows no longer have. These tests pin the
three cases the transition needs:

- a normal undo is recorded as a ``correction`` and ``GameState`` follows the
  log *and* the rows;
- a second undo of the same play writes no second event and changes nothing;
- an undo of a row no event produced never fails and never invents history: it
  flags the projection for reconciliation (T6) and leaves the rows deleted.
"""

import json

import pytest
from rest_framework.reverse import reverse

from gameevents.models import GameEvent, GameState
from gameevents.service.append import project_game
from gameevents.tests.api.support import (
    legacy_body,
    login,
    make_game,
    post_events,
    post_legacy,
    sub_id,
)
from gamedays.constants import API_GAMELOG
from gamedays.models import Gameresult, TeamLog

TOUCHDOWN_PAT = [
    {"name": "Touchdown", "player": "7"},
    {"name": "1-Extra-Punkt", "player": "7"},
]


def delete_sequence(client, game, sequence):
    return client.delete(
        reverse(API_GAMELOG, kwargs={"id": game.pk}),
        data=json.dumps({"sequence": sequence}),
        content_type="application/json",
    )


def live_score(game):
    return sum(
        row.value
        for row in TeamLog.objects.filter(gameinfo=game, isDeleted=False)
        if row.event not in ("Strafe", "Spielzeit", "Auszeit", "First Down")
    )


@pytest.mark.django_db
def test_a_legacy_undo_finds_a_play_the_canonical_path_wrote(client):
    # A game the new endpoint writes is still undone through the old one while
    # the app has not switched; the target is resolved by the same rule.
    game, _home, _away = make_game("undo-canonical-play")
    login(client)
    assert (
        post_events(
            client,
            game,
            {
                "events": [
                    {
                        "type": "score",
                        "code": "touchdown",
                        "side": "home",
                        "player": 7,
                        "period": 1,
                        "payload": {},
                    }
                ],
                "client_id": sub_id(1),
            },
        ).status_code
        == 201
    )

    response = delete_sequence(client, game, 1)

    assert response.status_code == 200
    correction = GameEvent.objects.get(game=game, type=GameEvent.Type.CORRECTION)
    assert correction.undo_of.seq == 1
    state = GameState.objects.get(game=game)
    assert (state.score_home, state.score_away) == (0, 0)
    assert not TeamLog.objects.filter(gameinfo=game, isDeleted=False).exists()
    assert Gameresult.objects.get(gameinfo=game, isHome=True).fh == 0


@pytest.mark.django_db
def test_an_undo_of_a_row_without_an_event_flags_reconciliation(client):
    # A row written before the store existed (old scorecard, pre-deploy game).
    game, home, _away = make_game("undo-unlogged")
    login(client)
    TeamLog.objects.create(
        gameinfo=game,
        team=home,
        sequence=1,
        event="Touchdown",
        player=7,
        value=6,
        half=1,
        # A pre-log row still has a real author; never the default user id.
        author=game.gameday.author,
    )

    response = delete_sequence(client, game, 1)

    assert response.status_code == 200
    assert TeamLog.objects.get(gameinfo=game, sequence=1).isDeleted is True
    # No history is invented: nothing was appended.
    assert GameEvent.objects.filter(game=game).count() == 0
    state = GameState.objects.get(game=game)
    assert state.needs_reconciliation is True
    assert "sequence 1" in state.reconciliation_note
    assert state.reconciliation_note


@pytest.mark.django_db
def test_a_sequence_zero_undo_of_the_harness_setup_flags_the_projection(client):
    """The reconciliation-flag scenario must reach the flag branch.

    A touchdown writes sequence 1; deleting sequence 0 before a sequence-0 row
    exists returns early in ``record_legacy_undo`` and flags nothing. The
    harness writes a penalty (sequence 0) as well, so this test pins the real
    409 / needs_reconciliation contract on both the undo and the feed.
    """

    game, home, _away = make_game("undo-shared-sequence")
    login(client)
    assert (
        post_legacy(
            client,
            game,
            legacy_body(
                game, home, [{"name": "Touchdown", "player": 7}], client_id=sub_id(1)
            ),
        ).status_code
        == 201
    )
    assert (
        post_legacy(
            client,
            game,
            legacy_body(
                game, home, [{"name": "Strafe", "player": 7, "input": "Holding"}]
            ),
        ).status_code
        == 201
    )
    assert TeamLog.objects.filter(gameinfo=game, sequence=0).exists()

    response = delete_sequence(client, game, 0)

    assert response.status_code == 200
    state = GameState.objects.get(game=game)
    assert state.needs_reconciliation is True
    assert "sequence 0" in state.reconciliation_note

    feed = client.get(
        reverse("api-game-feed", kwargs={"game_id": game.pk}), {"after": 0}
    )
    assert feed.status_code == 409
    assert feed.json()["needs_reconciliation"] is True

