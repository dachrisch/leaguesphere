"""A game result written on a published gameday must sync the matching
designer canvas node server-side.

The designer canvas stores each game's halftime/final score in the node's
``data`` (used for display and progression simulation). On a locked
(published) gameday the client may not PUT the whole ``state_data`` blob, so
the result endpoint owns that single-node sync instead.
"""

import datetime
import uuid

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from gamedays.models import (
    Gameday,
    GamedayDesignerState,
    Gameinfo,
    Gameresult,
    League,
    Season,
    Team,
)


def _game_node(node_id):
    return {
        "id": node_id,
        "type": "game",
        "parentId": "stage-1",
        "data": {"type": "game", "standing": "Spiel 1"},
        "position": {"x": 0, "y": 0},
    }


def _gameday(status=Gameday.STATUS_PUBLISHED):
    season = Season.objects.create(name="2026sync")
    league = League.objects.create(name="Sync League")
    author = User.objects.create_user(username="sync-author", password="x")
    return Gameday.objects.create(
        name="Sync Day",
        season=season,
        league=league,
        date=datetime.date(2026, 4, 1),
        start=datetime.time(10, 0),
        status=status,
        author=author,
    )


def _team(label):
    # Team.name and Team.description are both UNIQUE.
    tag = uuid.uuid4().hex[:8]
    return Team.objects.create(
        name=f"{label}-{tag}", description=f"{label}-{tag}", location="Test City"
    )


def _gameinfo(gameday, node_id="game-1"):
    game = Gameinfo.objects.create(
        gameday=gameday,
        scheduled=datetime.time(10, 0),
        field=1,
        stage="Vorrunde",
        standing="Spiel 1",
        officials=_team("O"),
        status=Gameinfo.STATUS_PUBLISHED,
        designer_node_id=node_id,
    )
    Gameresult.objects.create(gameinfo=game, team=_team("H"), isHome=True)
    Gameresult.objects.create(gameinfo=game, team=_team("A"), isHome=False)
    return game


@pytest.mark.django_db
class TestGameResultSyncsDesignerNode:
    def _client(self, gameday):
        client = APIClient()
        client.force_authenticate(gameday.author)
        return client

    def test_patch_result_updates_matching_canvas_node(self):
        gameday = _gameday()
        GamedayDesignerState.objects.create(
            gameday=gameday,
            state_data={"nodes": [_game_node("game-1")], "edges": [], "globalTeams": []},
        )
        game = _gameinfo(gameday, "game-1")

        response = self._client(gameday).patch(
            f"/api/gamedays/gameinfo/{game.pk}/result/",
            {
                "halftime_score": {"home": 1, "away": 0},
                "final_score": {"home": 3, "away": 1},
            },
            format="json",
        )

        assert response.status_code == 200
        node = GamedayDesignerState.objects.get(gameday=gameday).state_data["nodes"][0]
        assert node["data"]["halftime_score"] == {"home": 1, "away": 0}
        assert node["data"]["final_score"] == {"home": 3, "away": 1}

    def test_patch_result_updates_only_the_matching_node(self):
        gameday = _gameday()
        GamedayDesignerState.objects.create(
            gameday=gameday,
            state_data={
                "nodes": [_game_node("game-1"), _game_node("game-2")],
                "edges": [],
                "globalTeams": [],
            },
        )
        game = _gameinfo(gameday, "game-2")

        self._client(gameday).patch(
            f"/api/gamedays/gameinfo/{game.pk}/result/",
            {"final_score": {"home": 9, "away": 8}},
            format="json",
        )

        nodes = {
            n["id"]: n
            for n in GamedayDesignerState.objects.get(
                gameday=gameday
            ).state_data["nodes"]
        }
        assert "final_score" not in nodes["game-1"]["data"]
        assert nodes["game-2"]["data"]["final_score"] == {"home": 9, "away": 8}

    def test_patch_result_without_designer_node_id_leaves_state_untouched(self):
        # Swiss rows carry no designer_node_id; the result write must still
        # succeed and simply skip the canvas sync.
        gameday = _gameday()
        GamedayDesignerState.objects.create(
            gameday=gameday,
            state_data={"nodes": [_game_node("game-1")], "edges": [], "globalTeams": []},
        )
        game = _gameinfo(gameday, node_id="")

        response = self._client(gameday).patch(
            f"/api/gamedays/gameinfo/{game.pk}/result/",
            {"final_score": {"home": 2, "away": 2}},
            format="json",
        )

        assert response.status_code == 200
        node = GamedayDesignerState.objects.get(gameday=gameday).state_data["nodes"][0]
        assert "final_score" not in node["data"]

    def test_patch_result_without_designer_state_is_noop(self):
        gameday = _gameday()
        game = _gameinfo(gameday, "game-1")

        response = self._client(gameday).patch(
            f"/api/gamedays/gameinfo/{game.pk}/result/",
            {"final_score": {"home": 5, "away": 4}},
            format="json",
        )

        assert response.status_code == 200
