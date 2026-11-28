"""Branch characterization for AutoAssignOfficialsService (moved, N3)."""

from django.contrib.auth.models import User
from django.test import TestCase

from gamedays.models import (
    Gameday,
    GamedayDesignerState,
    Gameinfo,
    Gameresult,
    League,
    Season,
    Team,
)
from gameday_designer.service.auto_assign_officials_service import (
    AutoAssignOfficialsService,
)


class _Base(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="aa_branch", password="pw")
        self.gameday = Gameday.objects.create(
            name="Auto Assign Branches",
            season=Season.objects.create(name="2026"),
            league=League.objects.create(name="Test"),
            date="2026-07-16",
            start="10:00",
            author=self.user,
            status="DRAFT",
            format="4_1",
        )


class TestAssignFromGameinfosBranches(_Base):
    def setUp(self):
        super().setUp()
        self.teams = [
            Team.objects.create(name=f"Team {i}", description=f"T{i}") for i in range(4)
        ]

    def _game(self, scheduled, standing, home, away, field=1):
        gi = Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled=scheduled,
            field=field,
            stage="Vorrunde",
            standing=standing,
            status="Geplant",
            officials=self.teams[0],
        )
        Gameresult.objects.create(gameinfo=gi, team=home, isHome=True)
        Gameresult.objects.create(gameinfo=gi, team=away, isHome=False)
        return gi

    def test_results_without_team_are_ignored(self):
        t0, t1, t2, _ = self.teams
        g_a = self._game("10:00", "A", t0, None)
        g_b = self._game("11:00", "B", t1, t2)

        with self.assertNumQueries(5):
            assignments = AutoAssignOfficialsService(self.gameday.pk).assign()

        assert set(assignments) == {g_a.pk, g_b.pk}
        assert assignments[g_a.pk] in {t1.pk, t2.pk}
        assert assignments[g_b.pk] == t0.pk

    def test_single_field_fallback_skips_game_when_only_its_own_teams_exist(self):
        t0, t1, _, _ = self.teams
        gi = self._game("10:00", "A", t0, t1)

        with self.assertNumQueries(3):
            assert AutoAssignOfficialsService(self.gameday.pk).assign() == {}

        gi.refresh_from_db()
        assert gi.officials == t0  # untouched

    def test_group_stops_when_eligible_referees_run_out(self):
        t0, t1, t2, _ = self.teams
        first = self._game("10:00", "A", t0, t1)
        second = self._game("10:00", "A", t0, t1)
        later = self._game("11:00", "B", t2, None)

        assignments = AutoAssignOfficialsService(self.gameday.pk).assign()

        assert assignments[first.pk] == t2.pk
        assert second.pk not in assignments
        assert assignments[later.pk] in {t0.pk, t1.pk}
        second.refresh_from_db()
        assert second.officials == t0  # untouched


class TestAssignFromDesignerStateBranches(_Base):
    def _node(self, node_id, standing, home, away, parent="stage-1"):
        return {
            "id": node_id,
            "type": "game",
            "parentId": parent,
            "data": {
                "standing": standing,
                "official": None,
                "homeTeamId": home,
                "awayTeamId": away,
            },
        }

    def _state(self, nodes, team_ids):
        return GamedayDesignerState.objects.create(
            gameday=self.gameday,
            state_data={
                "nodes": [{"id": "field-1", "type": "field", "data": {}}, *nodes],
                "globalTeams": [{"id": t, "label": t.upper()} for t in team_ids],
            },
        )

    def test_missing_team_slot_and_no_free_referee_leaves_game_unassigned(self):
        state = self._state([self._node("g1", "A", "a", None)], ["a"])

        with self.assertNumQueries(4):
            assert AutoAssignOfficialsService(self.gameday.pk).assign() == {}

        state.refresh_from_db()
        assert state.state_data["nodes"][1]["data"]["official"] is None

    def test_group_stops_when_eligible_referees_run_out(self):
        state = self._state(
            [
                self._node("g1", "A", "a", "b"),
                self._node("g2", "A", "a", "b"),
                self._node("g3", "B", "c", None, parent="stage-2"),
            ],
            ["a", "b", "c"],
        )

        with self.assertNumQueries(4):
            assignments = AutoAssignOfficialsService(self.gameday.pk).assign()

        assert assignments["g1"] == "c"
        assert "g2" not in assignments
        assert assignments["g3"] in {"a", "b"}
        state.refresh_from_db()
        nodes = {n["id"]: n for n in state.state_data["nodes"]}
        assert nodes["g1"]["data"]["official"] == {"type": "static", "name": "c"}
        assert nodes["g2"]["data"]["official"] is None
