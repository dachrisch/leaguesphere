"""Branch characterization for CanvasPublishService (moved from gamedays, N3)."""

import pytest
from django.test import TestCase

from gamedays.models import GamedayDesignerState, Gameinfo, Gameresult, Team
from gamedays.tests.setup_factories.db_setup import DBSetup
from gameday_designer.service.canvas_progression_validation_service import (
    ProgressionValidationError,
)
from gameday_designer.service.canvas_publish_service import (
    OFFICIALS_PLACEHOLDER,
    CanvasPublishService,
)
from gameday_designer.tests.test_canvas_publish_service import (
    _state_data_with_one_game,
)


class TestCanvasPublishServiceApplyEarlyExits(TestCase):
    def test_apply_without_designer_state_is_a_noop(self):
        gameday = DBSetup().create_empty_gameday()
        with self.assertNumQueries(1):
            CanvasPublishService(gameday).apply()
        assert not Gameinfo.objects.filter(gameday=gameday).exists()

    def test_apply_with_empty_state_data_is_a_noop(self):
        gameday = DBSetup().create_empty_gameday()
        GamedayDesignerState.objects.create(gameday=gameday, state_data={})
        with self.assertNumQueries(1):
            CanvasPublishService(gameday).apply()
        assert not Gameinfo.objects.filter(gameday=gameday).exists()

    def test_apply_without_game_nodes_keeps_existing_gameinfos(self):
        gameday = DBSetup().create_empty_gameday()
        state_data = _state_data_with_one_game()
        state_data["nodes"] = state_data["nodes"][:2]  # field + stage only
        GamedayDesignerState.objects.create(gameday=gameday, state_data=state_data)
        existing = Gameinfo.objects.create(
            gameday=gameday,
            scheduled="10:00",
            field=1,
            stage="Alt",
            standing="Alt",
            officials=Team.objects.create(name="Off", description="Off"),
        )
        with self.assertNumQueries(1):
            CanvasPublishService(gameday).apply()
        assert list(Gameinfo.objects.filter(gameday=gameday)) == [existing]

    def test_apply_raises_on_invalid_progression_and_writes_nothing(self):
        gameday = DBSetup().create_empty_gameday()
        state_data = _state_data_with_one_game()
        state_data["nodes"][2]["data"]["homeTeamDynamic"] = {
            "type": "winner",
            "matchName": "does not exist",
        }
        GamedayDesignerState.objects.create(gameday=gameday, state_data=state_data)
        with self.assertNumQueries(1):
            with self.assertRaises(ProgressionValidationError) as ctx:
                CanvasPublishService(gameday).apply()
        assert [i.code for i in ctx.exception.issues] == ["dangling_reference"]
        assert not Gameinfo.objects.filter(gameday=gameday).exists()


class TestCanvasPublishServiceApplyResolution(TestCase):
    def test_apply_resolves_static_teams_dynamic_refs_and_officials(self):
        gameday = DBSetup().create_empty_gameday()
        state_data = _state_data_with_one_game()
        state_data["globalTeams"] = [
            {"id": "t-home", "label": "Home Team"},
            {"id": "t-ref", "label": "Ref Team"},
            {"id": "t-nolabel", "label": ""},
        ]
        data = state_data["nodes"][2]["data"]
        data["homeTeamId"] = "t-home"
        # awayTeamId points at a global team without label -> dynamic fallback
        data["awayTeamId"] = "t-nolabel"
        data["awayTeamDynamic"] = {"type": "groupTeam", "group": "A", "team": 2}
        data["official"] = {"type": "static", "name": "t-ref"}
        del data["startTime"]
        GamedayDesignerState.objects.create(gameday=gameday, state_data=state_data)

        with self.assertNumQueries(21):
            CanvasPublishService(gameday).apply()

        gi = Gameinfo.objects.get(gameday=gameday)
        assert gi.officials.name == "Ref Team"
        assert gi.field == 1
        assert gi.standing == "Tabelle"
        assert gi.status == Gameinfo.STATUS_PUBLISHED
        gameday.refresh_from_db()
        assert gi.scheduled == gameday.start  # no startTime -> gameday start
        teams = {
            gr.isHome: gr.team.name
            for gr in Gameresult.objects.filter(gameinfo=gi).select_related("team")
        }
        assert teams == {True: "Home Team", False: "A_2"}


class TestCanvasPublishServiceResolveTeam(TestCase):
    def setUp(self):
        self.service = CanvasPublishService(DBSetup().create_empty_gameday())

    def test_falsy_team_id_returns_none(self):
        assert self.service._resolve_team(None, {"x": {"label": "X"}}) is None

    def test_unknown_team_id_returns_none(self):
        assert self.service._resolve_team("missing", {}) is None

    def test_team_without_label_returns_none(self):
        assert self.service._resolve_team("t1", {"t1": {"label": ""}}) is None

    def test_labelled_team_is_get_or_created_by_name(self):
        existing = Team.objects.create(name="Lions", description="x")
        with self.assertNumQueries(1):
            team = self.service._resolve_team("t1", {"t1": {"label": "Lions"}})
        assert team == existing


class TestCanvasPublishServiceResolveDynamicTeam(TestCase):
    def setUp(self):
        self.service = CanvasPublishService(DBSetup().create_empty_gameday())

    def test_empty_ref_returns_none(self):
        assert self.service._resolve_dynamic_team(None) is None

    def test_ref_with_empty_label_returns_none(self):
        with self.assertNumQueries(0):
            assert self.service._resolve_dynamic_team({"type": "static"}) is None

    def test_labelled_ref_creates_placeholder_team(self):
        team = self.service._resolve_dynamic_team(
            {"type": "winner", "matchName": "HF1"}
        )
        assert team.name == "Gewinner HF1"
        assert team.description == "Gewinner HF1"
        assert team.location == ""


@pytest.mark.parametrize(
    "ref,expected",
    [
        (None, ""),
        ({}, ""),
        ({"type": "winner", "matchName": "VF 2"}, "Gewinner VF 2"),
        ({"type": "winner"}, "Gewinner "),
        ({"type": "loser", "matchName": "VF 2"}, "Verlierer VF 2"),
        ({"type": "standing", "place": 2, "groupName": "Gruppe A"}, "P2 Gruppe A"),
        ({"type": "rank", "place": 1, "stageName": "Vorrunde"}, "Rank 1 Vorrunde"),
        (
            {
                "type": "groupRank",
                "place": 3,
                "groupName": "Pool B",
                "stageName": "Quali",
            },
            "Rank 3 in Pool B of Quali",
        ),
        ({"type": "groupTeam", "group": "A", "team": 1}, "A_1"),
        ({"type": "static", "name": "t1"}, ""),
        ({"type": "unknown"}, ""),
        ({"matchName": "no type"}, ""),
    ],
)
def test_format_dynamic_ref(ref, expected):
    assert CanvasPublishService._format_dynamic_ref(ref) == expected


class TestCanvasPublishServiceResolveOfficial(TestCase):
    def setUp(self):
        self.service = CanvasPublishService(DBSetup().create_empty_gameday())
        self.fallback = Team.objects.create(
            name=OFFICIALS_PLACEHOLDER, description=OFFICIALS_PLACEHOLDER
        )

    def test_no_official_returns_fallback(self):
        with self.assertNumQueries(0):
            team = self.service._resolve_official(None, {}, self.fallback)
        assert team is self.fallback

    def test_static_official_resolves_global_team_id_to_label(self):
        globals_ = {"t1": {"id": "t1", "label": "Refs United"}}
        team = self.service._resolve_official(
            {"type": "static", "name": "t1"}, globals_, self.fallback
        )
        assert team.name == "Refs United"

    def test_static_official_global_team_without_label_keeps_id(self):
        team = self.service._resolve_official(
            {"type": "static", "name": "t1"}, {"t1": {"id": "t1"}}, self.fallback
        )
        assert team.name == "t1"

    def test_static_official_unknown_name_used_verbatim(self):
        existing = Team.objects.create(name="Free Text Refs", description="x")
        with self.assertNumQueries(1):
            team = self.service._resolve_official(
                {"type": "static", "name": "Free Text Refs"}, {}, self.fallback
            )
        assert team == existing

    def test_static_official_with_empty_name_returns_fallback(self):
        with self.assertNumQueries(0):
            team = self.service._resolve_official(
                {"type": "static", "name": ""}, {}, self.fallback
            )
        assert team is self.fallback

    def test_static_official_without_name_returns_fallback(self):
        team = self.service._resolve_official({"type": "static"}, {}, self.fallback)
        assert team is self.fallback

    def test_dynamic_official_resolves_to_readable_label(self):
        team = self.service._resolve_official(
            {"type": "loser", "matchName": "HF2"}, {}, self.fallback
        )
        assert team.name == "Verlierer HF2"

    def test_unknown_dynamic_official_returns_fallback(self):
        with self.assertNumQueries(0):
            team = self.service._resolve_official(
                {"type": "mystery"}, {}, self.fallback
            )
        assert team is self.fallback
