import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from gamedays.models import (
    Gameday,
    Gameinfo,
    Gameresult,
    GamedayDesignerState,
    Season,
    League,
)


def _stage_node(node_id, field_id, name, category):
    return {
        "id": node_id,
        "type": "stage",
        "parentId": field_id,
        "data": {"type": "stage", "name": name, "category": category},
        "position": {"x": 0, "y": 0},
    }


def _game_node(
    node_id,
    stage_id,
    stage_name,
    standing,
    start_time,
    home_team_id=None,
    away_team_id=None,
    home_dynamic=None,
    away_dynamic=None,
    official=None,
):
    return {
        "id": node_id,
        "type": "game",
        "parentId": stage_id,
        "data": {
            "type": "game",
            "stage": stage_name,
            "standing": standing,
            "startTime": start_time,
            "homeTeamId": home_team_id,
            "awayTeamId": away_team_id,
            "homeTeamDynamic": home_dynamic,
            "awayTeamDynamic": away_dynamic,
            "official": official,
        },
        "position": {"x": 0, "y": 0},
    }


# Mirrors the shape that broke on gameday 919: a 3-team round-robin group
# ("Vorrunde") feeding a downstream game via `rank` dynamic refs.
RANK_CANVAS_STATE = {
    "globalTeams": [
        {"id": "t1", "label": "Alpha", "groupId": None, "order": 0},
        {"id": "t2", "label": "Beta", "groupId": None, "order": 1},
        {"id": "t3", "label": "Gamma", "groupId": None, "order": 2},
    ],
    "globalTeamGroups": [],
    "nodes": [
        {
            "id": "field-1",
            "type": "field",
            "parentId": None,
            "data": {"type": "field", "name": "Field 1", "order": 0},
            "position": {"x": 0, "y": 0},
        },
        _stage_node("stage-vr", "field-1", "Vorrunde", "preliminary"),
        _game_node("game-ab", "stage-vr", "Vorrunde", "Spiel 1", "10:00", "t1", "t2"),
        _game_node("game-ac", "stage-vr", "Vorrunde", "Spiel 2", "10:30", "t1", "t3"),
        _game_node("game-bc", "stage-vr", "Vorrunde", "Spiel 3", "11:00", "t2", "t3"),
        _stage_node("stage-fin", "field-1", "Finale", "final"),
        _game_node(
            "game-final",
            "stage-fin",
            "Finale",
            "FIN",
            "12:00",
            home_dynamic={
                "type": "rank",
                "place": 1,
                "stageName": "Vorrunde",
                "stageId": "stage-vr",
            },
            away_dynamic={
                "type": "rank",
                "place": 2,
                "stageName": "Vorrunde",
                "stageId": "stage-vr",
            },
            official={
                "type": "rank",
                "place": 3,
                "stageName": "Vorrunde",
                "stageId": "stage-vr",
            },
        ),
    ],
    "edges": [],
}


# A prelim game feeding a downstream game's *officiating* team via a plain
# winner ref — regression coverage for gd919's officials field: 9828's
# official stayed "Gewinner HF 2" even after HF2 (an ordinary winner/loser
# case) had already finished, because progression only ever wrote to
# home/away, never to Gameinfo.officials.
WINNER_OFFICIAL_CANVAS_STATE = {
    "globalTeams": [
        {"id": "t1", "label": "Alpha", "groupId": None, "order": 0},
        {"id": "t2", "label": "Beta", "groupId": None, "order": 1},
    ],
    "globalTeamGroups": [],
    "nodes": [
        {
            "id": "field-1",
            "type": "field",
            "parentId": None,
            "data": {"type": "field", "name": "Field 1", "order": 0},
            "position": {"x": 0, "y": 0},
        },
        _stage_node("stage-1", "field-1", "Vorrunde", "preliminary"),
        _game_node("game-a1", "stage-1", "Vorrunde", "Game A1", "10:00", "t1", "t2"),
        _stage_node("stage-2", "field-1", "Finale", "final"),
        _game_node(
            "game-final",
            "stage-2",
            "Finale",
            "FIN2",
            "12:00",
            home_team_id="t1",
            away_team_id="t2",
            official={"type": "winner", "matchName": "Game A1"},
        ),
    ],
    "edges": [],
}


@pytest.mark.django_db
class TestCanvasRankProgression:
    """
    Regression coverage for the gd919 incident: canvas gamedays never resolved
    `rank` dynamic team refs (place N of a whole stage), unlike `winner`/`loser`
    refs. Both semifinals of a live tournament kicked off still assigned to the
    raw placeholder Team rows instead of the real qualifying teams.
    """

    def setup_method(self):
        self.user = User.objects.create_superuser("rank_test", password="pw")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        season = Season.objects.create(name="2026rank")
        league = League.objects.create(name="Rank League")
        self.gameday = Gameday.objects.create(
            name="Rank Day",
            season=season,
            league=league,
            date="2026-04-01",
            start="10:00",
            status=Gameday.STATUS_DRAFT,
            author=self.user,
        )
        GamedayDesignerState.objects.create(
            gameday=self.gameday, state_data=RANK_CANVAS_STATE
        )
        assert (
            self.client.post(f"/api/gamedays/{self.gameday.id}/publish/").status_code
            == 200
        )

    def _finalize(self, standing, home_score, away_score):
        gi = Gameinfo.objects.get(gameday=self.gameday, standing=standing)
        return self.client.patch(
            f"/api/gameinfo/{gi.id}/result/",
            {"final_score": {"home": home_score, "away": away_score}},
            format="json",
        )

    def _final_participants(self):
        final = Gameinfo.objects.get(gameday=self.gameday, standing="FIN")
        home = Gameresult.objects.get(gameinfo=final, isHome=True)
        away = Gameresult.objects.get(gameinfo=final, isHome=False)
        return home.team.name, away.team.name

    def test_rank_ref_unresolved_before_stage_finishes(self):
        # Only 2 of the group's 3 games are finished — the stage isn't complete yet.
        self._finalize("Spiel 1", 21, 7)  # Alpha beats Beta
        self._finalize("Spiel 2", 14, 10)  # Alpha beats Gamma

        assert self._final_participants() == ("Rank 1 Vorrunde", "Rank 2 Vorrunde")

    def test_rank_ref_resolves_once_stage_finishes(self):
        # Alpha: 2-0 -> rank 1. Beta beats Gamma -> Beta rank 2, Gamma rank 3.
        self._finalize("Spiel 1", 21, 7)  # Alpha beats Beta
        self._finalize("Spiel 2", 14, 10)  # Alpha beats Gamma
        self._finalize("Spiel 3", 20, 6)  # Beta beats Gamma

        assert self._final_participants() == ("Alpha", "Beta")

    def test_downstream_game_progresses_normally_after_rank_resolution(self):
        """Once the feeding stage's rank refs resolve to real teams, the
        downstream game must be playable and its own winner must still
        propagate normally afterwards (no special re-trigger needed)."""
        self._finalize("Spiel 1", 21, 7)
        self._finalize("Spiel 2", 14, 10)
        self._finalize("Spiel 3", 20, 6)

        resp = self._finalize("FIN", 30, 20)  # Alpha (home) beats Beta (away)
        assert resp.status_code == 200

        final = Gameinfo.objects.get(gameday=self.gameday, standing="FIN")
        home = Gameresult.objects.get(gameinfo=final, isHome=True)
        assert home.team.name == "Alpha"

    def test_rank_ref_resolves_officials_once_stage_finishes(self):
        """gd919 regression: the officiating team must resolve just like
        home/away — Gamma (3rd place) should end up refereeing the final."""
        self._finalize("Spiel 1", 21, 7)  # Alpha beats Beta
        self._finalize("Spiel 2", 14, 10)  # Alpha beats Gamma
        self._finalize("Spiel 3", 20, 6)  # Beta beats Gamma -> Gamma is 3rd

        final = Gameinfo.objects.get(gameday=self.gameday, standing="FIN")
        assert final.officials.name == "Gamma"


@pytest.mark.django_db
class TestCanvasWinnerOfficialProgression:
    """gd919 regression: an `officials` dynamic ref never re-resolved after
    the game it depends on completed — not just for `rank`, but for the
    already-working `winner`/`loser` case too, since progression only ever
    wrote to home/away Gameresult rows, never to Gameinfo.officials."""

    def setup_method(self):
        self.user = User.objects.create_superuser("official_test", password="pw")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        season = Season.objects.create(name="2026official")
        league = League.objects.create(name="Official League")
        self.gameday = Gameday.objects.create(
            name="Official Day",
            season=season,
            league=league,
            date="2026-04-02",
            start="10:00",
            status=Gameday.STATUS_DRAFT,
            author=self.user,
        )
        GamedayDesignerState.objects.create(
            gameday=self.gameday, state_data=WINNER_OFFICIAL_CANVAS_STATE
        )
        assert (
            self.client.post(f"/api/gamedays/{self.gameday.id}/publish/").status_code
            == 200
        )

    def _finalize(self, standing, home_score, away_score):
        gi = Gameinfo.objects.get(gameday=self.gameday, standing=standing)
        return self.client.patch(
            f"/api/gameinfo/{gi.id}/result/",
            {"final_score": {"home": home_score, "away": away_score}},
            format="json",
        )

    def test_winner_ref_resolves_official_after_game_completes(self):
        self._finalize("Game A1", 21, 7)  # Alpha beats Beta

        final = Gameinfo.objects.get(gameday=self.gameday, standing="FIN2")
        assert final.officials.name == "Alpha"
