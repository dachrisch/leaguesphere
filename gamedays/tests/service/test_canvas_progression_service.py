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
from gamedays.service.canvas_progression_service import CanvasBracketProgressionService


def _stage_node(node_id, field_id, name, category="preliminary"):
    return {
        "id": node_id,
        "type": "stage",
        "parentId": field_id,
        "data": {"type": "stage", "name": name, "category": category},
        "position": {"x": 0, "y": 0},
    }


def _game_node(node_id, stage_id, stage_name, standing, **data_overrides):
    data = {
        "type": "game",
        "stage": stage_name,
        "standing": standing,
        "startTime": "10:00",
        "homeTeamId": None,
        "awayTeamId": None,
        "homeTeamDynamic": None,
        "awayTeamDynamic": None,
        "official": None,
    }
    data.update(data_overrides)
    return {
        "id": node_id,
        "type": "game",
        "parentId": stage_id,
        "data": data,
        "position": {"x": 0, "y": 0},
    }


@pytest.mark.django_db
class TestCanvasBracketProgressionServiceEdgeCases:
    """Unit-level edge case coverage for CanvasBracketProgressionService,
    complementing the end-to-end publish/finalize regression tests in
    gamedays/api/tests/test_canvas_rank_progression.py."""

    def setup_method(self):
        self.user = User.objects.create_user(username="edge_test", password="pw")
        self.season = Season.objects.create(name="edge2026")
        self.league = League.objects.create(name="Edge League")
        self.team_a = Team.objects.create(name="A", description="A", location="City")
        self.team_b = Team.objects.create(name="B", description="B", location="City")
        self.gameday = Gameday.objects.create(
            name="Edge Day",
            season=self.season,
            league=self.league,
            date=date(2026, 5, 1),
            start="10:00",
            author=self.user,
        )

    def _make_game(self, standing="G1", stage="Vorrunde"):
        return Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled="10:00",
            field=1,
            officials=self.team_a,
            stage=stage,
            standing=standing,
            status=Gameinfo.STATUS_COMPLETED,
        )

    def test_apply_noop_without_designer_state(self):
        """No GamedayDesignerState -> apply() returns without error."""
        gi = self._make_game()
        Gameresult.objects.create(
            gameinfo=gi, team=self.team_a, isHome=True, fh=1, sh=0
        )
        Gameresult.objects.create(
            gameinfo=gi, team=self.team_b, isHome=False, fh=0, sh=0
        )

        CanvasBracketProgressionService(gi).apply()  # must not raise

    def test_apply_noop_with_fewer_than_two_results(self):
        gi = self._make_game()
        GamedayDesignerState.objects.create(
            gameday=self.gameday, state_data={"nodes": []}
        )
        Gameresult.objects.create(
            gameinfo=gi, team=self.team_a, isHome=True, fh=1, sh=0
        )

        CanvasBracketProgressionService(gi).apply()  # must not raise

    def test_apply_noop_when_home_or_away_result_missing(self):
        """Two results but both isHome=True -> no distinct home/away pair."""
        gi = self._make_game()
        GamedayDesignerState.objects.create(
            gameday=self.gameday, state_data={"nodes": []}
        )
        Gameresult.objects.create(
            gameinfo=gi, team=self.team_a, isHome=True, fh=1, sh=0
        )
        Gameresult.objects.create(
            gameinfo=gi, team=self.team_b, isHome=True, fh=0, sh=0
        )

        CanvasBracketProgressionService(gi).apply()  # must not raise

    def test_away_winner_propagates_when_away_scores_more(self):
        prelim = self._make_game(standing="G1", stage="Vorrunde")
        final = Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled="12:00",
            field=1,
            officials=self.team_a,
            stage="Finale",
            standing="FIN",
            status=Gameinfo.STATUS_PUBLISHED,
        )
        placeholder = Team.objects.create(
            name="Gewinner G1", description="Gewinner G1", location=""
        )
        Gameresult.objects.create(gameinfo=final, team=placeholder, isHome=True)

        state_data = {
            "nodes": [
                {
                    "id": "field-1",
                    "type": "field",
                    "parentId": None,
                    "data": {"type": "field", "name": "Field 1", "order": 0},
                    "position": {"x": 0, "y": 0},
                },
                _stage_node("stage-1", "field-1", "Vorrunde"),
                _game_node("game-g1", "stage-1", "Vorrunde", "G1"),
                _stage_node("stage-2", "field-1", "Finale", "final"),
                _game_node(
                    "game-fin",
                    "stage-2",
                    "Finale",
                    "FIN",
                    homeTeamDynamic={"type": "winner", "matchName": "G1"},
                ),
            ]
        }
        GamedayDesignerState.objects.create(gameday=self.gameday, state_data=state_data)

        Gameresult.objects.create(
            gameinfo=prelim, team=self.team_a, isHome=True, fh=1, sh=0
        )
        Gameresult.objects.create(
            gameinfo=prelim, team=self.team_b, isHome=False, fh=2, sh=0
        )

        CanvasBracketProgressionService(prelim).apply()

        final_home = Gameresult.objects.get(gameinfo=final, isHome=True)
        assert final_home.team == self.team_b  # away team scored more -> winner

    def test_game_node_without_standing_is_skipped(self):
        gi = self._make_game(standing="G1")
        state_data = {
            "nodes": [
                {
                    "id": "field-1",
                    "type": "field",
                    "parentId": None,
                    "data": {"type": "field", "name": "Field 1", "order": 0},
                    "position": {"x": 0, "y": 0},
                },
                _stage_node("stage-1", "field-1", "Vorrunde"),
                {
                    "id": "game-broken",
                    "type": "game",
                    "parentId": "stage-1",
                    "data": {
                        "type": "game",
                        "stage": "Vorrunde",
                        "standing": "",  # falsy -> _propagate must skip this node
                        "homeTeamDynamic": {"type": "winner", "matchName": "G1"},
                        "awayTeamDynamic": None,
                        "official": None,
                    },
                    "position": {"x": 0, "y": 0},
                },
            ]
        }
        GamedayDesignerState.objects.create(gameday=self.gameday, state_data=state_data)
        Gameresult.objects.create(
            gameinfo=gi, team=self.team_a, isHome=True, fh=1, sh=0
        )
        Gameresult.objects.create(
            gameinfo=gi, team=self.team_b, isHome=False, fh=0, sh=0
        )

        CanvasBracketProgressionService(gi).apply()  # must not raise

    def test_ref_pointing_at_nonexistent_standing_is_ignored(self):
        gi = self._make_game(standing="G1")
        state_data = {
            "nodes": [
                {
                    "id": "field-1",
                    "type": "field",
                    "parentId": None,
                    "data": {"type": "field", "name": "Field 1", "order": 0},
                    "position": {"x": 0, "y": 0},
                },
                _stage_node("stage-1", "field-1", "Vorrunde"),
                _game_node(
                    "game-ghost",
                    "stage-1",
                    "Vorrunde",
                    "GHOST",  # no Gameinfo with this standing exists
                    homeTeamDynamic={"type": "winner", "matchName": "G1"},
                ),
            ]
        }
        GamedayDesignerState.objects.create(gameday=self.gameday, state_data=state_data)
        Gameresult.objects.create(
            gameinfo=gi, team=self.team_a, isHome=True, fh=1, sh=0
        )
        Gameresult.objects.create(
            gameinfo=gi, team=self.team_b, isHome=False, fh=0, sh=0
        )

        CanvasBracketProgressionService(
            gi
        ).apply()  # must not raise / no matching Gameinfo

    def test_rank_place_beyond_group_size_is_ignored(self):
        """A `rank` ref asking for place 4 in a 2-team group must resolve to
        nothing instead of raising an IndexError."""
        g1 = self._make_game(standing="G1", stage="Vorrunde")
        final = Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled="12:00",
            field=1,
            officials=self.team_a,
            stage="Finale",
            standing="FIN",
            status=Gameinfo.STATUS_PUBLISHED,
        )
        placeholder = Team.objects.create(
            name="Rank 4 Vorrunde", description="Rank 4 Vorrunde", location=""
        )
        Gameresult.objects.create(gameinfo=final, team=placeholder, isHome=True)

        state_data = {
            "nodes": [
                {
                    "id": "field-1",
                    "type": "field",
                    "parentId": None,
                    "data": {"type": "field", "name": "Field 1", "order": 0},
                    "position": {"x": 0, "y": 0},
                },
                _stage_node("stage-1", "field-1", "Vorrunde"),
                _game_node("game-g1", "stage-1", "Vorrunde", "G1"),
                _stage_node("stage-2", "field-1", "Finale", "final"),
                _game_node(
                    "game-fin",
                    "stage-2",
                    "Finale",
                    "FIN",
                    homeTeamDynamic={
                        "type": "rank",
                        "place": 4,
                        "stageName": "Vorrunde",
                        "stageId": "stage-1",
                    },
                ),
            ]
        }
        GamedayDesignerState.objects.create(gameday=self.gameday, state_data=state_data)
        Gameresult.objects.create(
            gameinfo=g1, team=self.team_a, isHome=True, fh=1, sh=0
        )
        Gameresult.objects.create(
            gameinfo=g1, team=self.team_b, isHome=False, fh=0, sh=0
        )

        CanvasBracketProgressionService(g1).apply()

        final_home = Gameresult.objects.get(gameinfo=final, isHome=True)
        assert final_home.team == placeholder  # untouched, no IndexError

    def test_rank_resolution_combines_games_from_different_fields(self):
        """A single stage's games can be split across multiple physical
        `field` values (a placement phase spanning several fields). The
        stage's rank standings must combine ALL of that stage's games
        regardless of field -- proving the field-agnostic aggregation a
        multi-field Designer stage relies on for correct global seeding.
        """
        team_c = Team.objects.create(name="C", description="C", location="City")

        # field 1: B beats C
        g_field1 = Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled="10:00",
            field=1,
            officials=self.team_a,
            stage="Platzierung",
            standing="G1",
            status=Gameinfo.STATUS_COMPLETED,
        )
        Gameresult.objects.create(
            gameinfo=g_field1, team=self.team_b, isHome=True, fh=2, sh=0
        )
        Gameresult.objects.create(
            gameinfo=g_field1, team=team_c, isHome=False, fh=0, sh=0
        )

        # field 2: A beats B -- if standings were wrongly scoped to one
        # field, A (who never played on field 1) would never enter the
        # table and rank 1 would incorrectly resolve to B.
        g_field2 = Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled="10:00",
            field=2,
            officials=self.team_a,
            stage="Platzierung",
            standing="G2",
            status=Gameinfo.STATUS_COMPLETED,
        )
        Gameresult.objects.create(
            gameinfo=g_field2, team=self.team_a, isHome=True, fh=2, sh=0
        )
        Gameresult.objects.create(
            gameinfo=g_field2, team=self.team_b, isHome=False, fh=0, sh=0
        )

        final = Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled="12:00",
            field=1,
            officials=self.team_a,
            stage="Finale",
            standing="FIN",
            status=Gameinfo.STATUS_PUBLISHED,
        )
        placeholder = Team.objects.create(
            name="Rank 1 Platzierung", description="Rank 1 Platzierung", location=""
        )
        Gameresult.objects.create(gameinfo=final, team=placeholder, isHome=True)

        state_data = {
            "nodes": [
                {
                    "id": "field-1",
                    "type": "field",
                    "parentId": None,
                    "data": {"type": "field", "name": "Field 1", "order": 0},
                    "position": {"x": 0, "y": 0},
                },
                {
                    "id": "field-2",
                    "type": "field",
                    "parentId": None,
                    "data": {"type": "field", "name": "Field 2", "order": 1},
                    "position": {"x": 0, "y": 0},
                },
                _stage_node("stage-1", "field-1", "Platzierung"),
                _game_node("game-g1", "stage-1", "Platzierung", "G1"),
                _game_node(
                    "game-g2", "stage-1", "Platzierung", "G2", fieldId="field-2"
                ),
                _stage_node("stage-2", "field-1", "Finale", "final"),
                _game_node(
                    "game-fin",
                    "stage-2",
                    "Finale",
                    "FIN",
                    homeTeamDynamic={
                        "type": "rank",
                        "place": 1,
                        "stageName": "Platzierung",
                        "stageId": "stage-1",
                    },
                ),
            ]
        }
        GamedayDesignerState.objects.create(gameday=self.gameday, state_data=state_data)

        CanvasBracketProgressionService(g_field1).apply()
        CanvasBracketProgressionService(g_field2).apply()

        final_home = Gameresult.objects.get(gameinfo=final, isHome=True)
        assert final_home.team == self.team_a
