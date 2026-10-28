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
        if row.event
        not in ("Strafe", "Spielzeit", "Auszeit", "First Down")
    )


@pytest.mark.django_db
def test_a_legacy_undo_is_recorded_as_a_correction(client):
    game, home, _away = make_game("undo-record")
    login(client)
    assert (
        post_legacy(
            client,
            game,
            legacy_body(game, home, TOUCHDOWN_PAT, client_id="sub-1"),
        ).status_code
        == 201
    )

    response = delete_sequence(client, game, 1)

    assert response.status_code == 200
    assert response.json()["home"]["score"] == 0
    # The rows are deleted by the legacy writer, and the log says why.
    assert not TeamLog.objects.filter(gameinfo=game, isDeleted=False).exists()
    assert TeamLog.objects.filter(gameinfo=game, sequence=1).count() == 2
    correction = GameEvent.objects.get(game=game, type=GameEvent.Type.CORRECTION)
    assert correction.seq == 3
    assert correction.code == "undo"
    assert correction.source == GameEvent.Source.LEGACY
    assert correction.undo_of.seq == 1
    assert correction.payload == {"undo_of": 1}

    # GameState == a re-projection of the stored log == the rows.
    state = GameState.objects.get(game=game)
    replayed = project_game(game).state
    assert (
        state.score_home,
        state.score_away,
        state.last_seq,
    ) == (
        replayed.score_home,
        replayed.score_away,
        replayed.last_seq,
    ) == (0, 0, 3)
    assert state.score_home + state.score_away == live_score(game) == 0
    assert state.needs_reconciliation is False
    # The result table follows the rows, as it did before the correction.
    home_result = Gameresult.objects.get(gameinfo=game, isHome=True)
    assert (home_result.fh, home_result.sh) == (0, 0)


@pytest.mark.django_db
def test_a_second_undo_of_the_same_play_changes_nothing(client):
    game, home, _away = make_game("undo-twice")
    login(client)
    post_legacy(
        client, game, legacy_body(game, home, TOUCHDOWN_PAT, client_id="sub-1")
    )
    assert delete_sequence(client, game, 1).status_code == 200
    before = GameState.objects.get(game=game)
    result_before = tuple(
        Gameresult.objects.filter(gameinfo=game)
        .order_by("isHome")
        .values_list("fh", "sh", "pa")
    )

    response = delete_sequence(client, game, 1)

    assert response.status_code == 200
    # One correction, not two: a repeated undo is a no-op in the log as well.
    assert GameEvent.objects.filter(game=game, type="correction").count() == 1
    assert GameEvent.objects.filter(game=game).count() == 3
    after = GameState.objects.get(game=game)
    assert (after.score_home, after.score_away, after.last_seq) == (
        before.score_home,
        before.score_away,
        before.last_seq,
    )
    assert (
        tuple(
            Gameresult.objects.filter(gameinfo=game)
            .order_by("isHome")
            .values_list("fh", "sh", "pa")
        )
        == result_before
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
                "client_id": "sub-1",
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
def test_an_unlogged_row_is_flagged_even_when_the_game_has_events(client):
    game, home, _away = make_game("undo-unlogged-mixed")
    login(client)
    post_legacy(
        client, game, legacy_body(game, home, TOUCHDOWN_PAT, client_id="sub-1")
    )
    # The old writer logged this row outside the store (no event covers
    # sequence 2).
    TeamLog.objects.create(
        gameinfo=game,
        team=home,
        sequence=2,
        event="Touchdown",
        player=9,
        value=6,
        half=2,
    )

    response = delete_sequence(client, game, 2)

    assert response.status_code == 200
    assert TeamLog.objects.filter(gameinfo=game, sequence=2, isDeleted=True).exists()
    # The evented play is untouched and nothing claims to describe sequence 2.
    assert GameEvent.objects.filter(game=game).count() == 2
    assert not TeamLog.objects.filter(
        gameinfo=game, sequence=1, isDeleted=True
    ).exists()
    state = GameState.objects.get(game=game)
    assert state.needs_reconciliation is True
    assert state.score_home == 7
