"""Branch characterization for CanvasBracketProgressionService (moved, N3)."""

from datetime import date

import pytest
from django.contrib.auth.models import User

from gamedays.models import (
    Gameday,
    Gameinfo,
    GamedayDesignerState,
    Gameresult,
    League,
    Season,
    Team,
)
from gameday_designer.service.canvas_progression_service import (
    CanvasBracketProgressionService,
)
from gameday_designer.tests.test_canvas_progression_service import (
    _game_node,
    _stage_node,
)

FIELD = {
    "id": "field-1",
    "type": "field",
    "parentId": None,
    "data": {"type": "field", "name": "Field 1", "order": 0},
}


@pytest.mark.django_db
class TestProgressionBranches:
    def setup_method(self):
        user = User.objects.create_user(username="branch_test", password="pw")
        self.team_a = Team.objects.create(name="A", description="A")
        self.team_b = Team.objects.create(name="B", description="B")
        self.placeholder = Team.objects.create(name="PH", description="PH")
        self.gameday = Gameday.objects.create(
            name="Branch Day",
            season=Season.objects.create(name="branch2026"),
            league=League.objects.create(name="Branch League"),
            date=date(2026, 5, 1),
            start="10:00",
            author=user,
        )

    def _gameinfo(self, standing, stage, status=Gameinfo.STATUS_COMPLETED, **kw):
        return Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled="10:00",
            field=1,
            officials=self.placeholder,
            stage=stage,
            standing=standing,
            status=status,
            **kw,
        )

    def _completed_g1(self):
        g1 = self._gameinfo("G1", "Vorrunde")
        Gameresult.objects.create(
            gameinfo=g1, team=self.team_a, isHome=True, fh=3, sh=0
        )
        Gameresult.objects.create(
            gameinfo=g1, team=self.team_b, isHome=False, fh=0, sh=0
        )
        return g1

    def _final(self):
        final = self._gameinfo("FIN", "Finale", status=Gameinfo.STATUS_PUBLISHED)
        Gameresult.objects.create(gameinfo=final, team=self.placeholder, isHome=True)
        Gameresult.objects.create(gameinfo=final, team=self.placeholder, isHome=False)
        return final

    def _state(self, *nodes):
        GamedayDesignerState.objects.create(
            gameday=self.gameday,
            state_data={
                "nodes": [
                    FIELD,
                    _stage_node("stage-1", "field-1", "Vorrunde"),
                    _game_node("game-g1", "stage-1", "Vorrunde", "G1"),
                    _stage_node("stage-2", "field-1", "Finale", "final"),
                    *nodes,
                ]
            },
        )

    def test_official_winner_ref_updates_target_gameinfo_officials(
        self, django_assert_num_queries
    ):
        g1 = self._completed_g1()
        final = self._final()
        self._state(
            _game_node(
                "game-fin",
                "stage-2",
                "Finale",
                "FIN",
                official={"type": "loser", "matchName": "G1"},
            )
        )

        with django_assert_num_queries(8):
            CanvasBracketProgressionService(g1).apply()

        final.refresh_from_db()
        assert final.officials == self.team_b
        assert set(
            Gameresult.objects.filter(gameinfo=final).values_list("team", flat=True)
        ) == {self.placeholder.pk}

    def test_official_ref_without_target_gameinfo_is_ignored(self):
        g1 = self._completed_g1()
        self._state(
            _game_node(
                "game-ghost",
                "stage-2",
                "Finale",
                "GHOST",
                official={"type": "winner", "matchName": "G1"},
            )
        )

        CanvasBracketProgressionService(g1).apply()  # must not raise

        g1.refresh_from_db()
        assert g1.officials == self.placeholder

    def test_node_without_id_falls_back_to_standing_lookup(self):
        g1 = self._completed_g1()
        final = self._final()
        node = _game_node(
            None,
            "stage-2",
            "Finale",
            "FIN",
            homeTeamDynamic={"type": "winner", "matchName": "G1"},
        )
        del node["id"]
        self._state(node)

        CanvasBracketProgressionService(g1).apply()

        assert Gameresult.objects.get(gameinfo=final, isHome=True).team == self.team_a

    def test_rank_ref_resolves_once_stage_is_finished(self, django_assert_num_queries):
        g1 = self._completed_g1()
        final = self._final()
        self._state(
            _game_node(
                "game-fin",
                "stage-2",
                "Finale",
                "FIN",
                homeTeamDynamic={"type": "rank", "place": 1, "stageName": "Vorrunde"},
                awayTeamDynamic={"type": "rank", "place": 2, "stageName": "Vorrunde"},
            )
        )

        with django_assert_num_queries(11):
            CanvasBracketProgressionService(g1).apply()

        teams = dict(
            Gameresult.objects.filter(gameinfo=final).values_list("isHome", "team")
        )
        assert teams == {True: self.team_a.pk, False: self.team_b.pk}

    def test_target_gameinfo_without_id_or_standing_is_none(self):
        g1 = self._completed_g1()
        service = CanvasBracketProgressionService(g1)
        assert service._target_gameinfo({"data": {}}) is None
        assert service._target_gameinfo({}) is None
