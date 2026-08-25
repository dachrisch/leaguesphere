import hashlib
import json

import pytest
from django.test import TestCase

from gameday_designer.models import ScheduleTemplate, TemplateSlot, TemplateApplication
from gamedays.models import Gameday, Gameinfo, Gameresult, GameOfficial
from gamedays.service.gameday_migration_service import (
    GamedayMigrationError,
    GamedayMigrationService,
)
from gamedays.service.stage_category import StageCategory, derive_legacy_stage_category
from gamedays.tests.setup_factories.factories import (
    GamedayFactory,
    GameinfoFactory,
    GameresultFactory,
    GameOfficialFactory,
    TeamFactory,
)


def _build_two_slot_scenario(with_application=True):
    """A 1-field, 2-group template with two slots, applied to a gameday whose
    two real Gameinfo/Gameresult rows were played out exactly against it.

    Slot 1: home=0_0, away=1_0, official=0_1
    Slot 2: home=0_1, away=1_1, official=1_0
    """
    gameday = GamedayFactory(format="migration_test")

    team_a0 = TeamFactory(name="A0", description="Team A0")
    team_a1 = TeamFactory(name="A1", description="Team A1")
    team_b0 = TeamFactory(name="B0", description="Team B0")
    team_b1 = TeamFactory(name="B1", description="Team B1")

    template = ScheduleTemplate.objects.create(
        name="Migration Test Template", num_teams=4, num_fields=1, num_groups=2
    )
    slot1 = TemplateSlot.objects.create(
        template=template,
        field=1,
        slot_order=1,
        stage="Vorrunde",
        standing="Gruppe 1",
        home_group=0,
        home_team=0,
        away_group=1,
        away_team=0,
        official_group=0,
        official_team=1,
    )
    slot2 = TemplateSlot.objects.create(
        template=template,
        field=1,
        slot_order=2,
        stage="Vorrunde",
        standing="Gruppe 1",
        home_group=0,
        home_team=1,
        away_group=1,
        away_team=1,
        official_group=1,
        official_team=0,
    )

    if with_application:
        TemplateApplication.objects.create(
            gameday=gameday, template=template, team_mapping={}
        )

    gi1 = GameinfoFactory(
        gameday=gameday,
        field=1,
        scheduled="10:00",
        stage="Vorrunde",
        standing="Gruppe 1",
        officials=team_a1,
    )
    GameresultFactory(gameinfo=gi1, team=team_a0, isHome=True)
    GameresultFactory(gameinfo=gi1, team=team_b0, isHome=False)

    gi2 = GameinfoFactory(
        gameday=gameday,
        field=1,
        scheduled="11:10",
        stage="Vorrunde",
        standing="Gruppe 1",
        officials=team_b0,
    )
    GameresultFactory(gameinfo=gi2, team=team_a1, isHome=True)
    GameresultFactory(gameinfo=gi2, team=team_b1, isHome=False)

    teams = {"a0": team_a0, "a1": team_a1, "b0": team_b0, "b1": team_b1}
    return gameday, template, (slot1, slot2), (gi1, gi2), teams


class TestTemplateResolution(TestCase):
    def test_resolves_template_via_template_application(self):
        gameday, template, *_ = _build_two_slot_scenario(with_application=True)

        plan = GamedayMigrationService(gameday).build_plan()

        assert plan["template_id"] == template.pk

    def test_resolves_template_via_format_name_fallback(self):
        gameday, template, *_ = _build_two_slot_scenario(with_application=False)
        # No TemplateApplication row -> GamedayPlaceholderService falls back to
        # the "schedule_{format}" naming convention.
        template.name = f"schedule_{gameday.format}"
        template.save()

        plan = GamedayMigrationService(gameday).build_plan()

        assert plan["template_id"] == template.pk

    def test_raises_when_no_template_resolves(self):
        gameday = GamedayFactory(format="totally_unmatched_format")

        with self.assertRaises(GamedayMigrationError):
            GamedayMigrationService(gameday).build_plan()

    def test_raises_when_gameday_has_no_games(self):
        gameday = GamedayFactory(format="migration_test_empty")
        template = ScheduleTemplate.objects.create(
            name="Empty Template", num_teams=2, num_fields=1, num_groups=1
        )
        TemplateApplication.objects.create(
            gameday=gameday, template=template, team_mapping={}
        )

        with self.assertRaises(GamedayMigrationError):
            GamedayMigrationService(gameday).build_plan()


class TestTeamMappingReconstruction(TestCase):
    def setUp(self):
        (
            self.gameday,
            self.template,
            (self.slot1, self.slot2),
            (self.gi1, self.gi2),
            self.teams,
        ) = _build_two_slot_scenario()

    def test_top_level_fields(self):
        plan = GamedayMigrationService(self.gameday).build_plan()

        assert plan["template_id"] == self.template.pk
        assert plan["num_fields"] == 1
        assert plan["num_groups"] == 2
        assert plan["warnings"] == []

    def test_team_mapping_matches_actual_assignments(self):
        plan = GamedayMigrationService(self.gameday).build_plan()

        assert plan["team_mapping"] == {
            "0_0": {"id": self.teams["a0"].pk, "label": "A0"},
            "1_0": {"id": self.teams["b0"].pk, "label": "B0"},
            "0_1": {"id": self.teams["a1"].pk, "label": "A1"},
            "1_1": {"id": self.teams["b1"].pk, "label": "B1"},
        }

    def test_group_config_reflects_actual_team_counts(self):
        plan = GamedayMigrationService(self.gameday).build_plan()

        assert plan["group_config"] == [
            {"name": "Gruppe A", "team_count": 2},
            {"name": "Gruppe B", "team_count": 2},
        ]

    def test_slots_serialize_full_template_structure(self):
        plan = GamedayMigrationService(self.gameday).build_plan()

        assert len(plan["slots"]) == 2
        slot1_data, slot2_data = plan["slots"]

        assert slot1_data == {
            "field": 1,
            "slot_order": 1,
            "stage": "Vorrunde",
            "stage_type": "STANDARD",
            "stage_category": StageCategory.PRELIMINARY,
            "standing": "Gruppe 1",
            "home_group": 0,
            "home_team": 0,
            "home_reference": "",
            "away_group": 1,
            "away_team": 0,
            "away_reference": "",
            "official_group": 0,
            "official_team": 1,
            "official_reference": "",
            "break_after": 0,
        }
        assert slot2_data["slot_order"] == 2
        assert slot2_data["home_group"] == 0
        assert slot2_data["home_team"] == 1


class TestOrphanedGameSkipped(TestCase):
    def test_unmatched_game_is_skipped_with_warning_not_raised(self):
        gameday, template, _, (gi1, gi2), teams = _build_two_slot_scenario()
        # Extra game on a field the template has no slots for at all.
        orphan = GameinfoFactory(
            gameday=gameday,
            field=2,
            scheduled="09:00",
            stage="Vorrunde",
            standing="Gruppe 1",
            officials=TeamFactory(name="Orphan Officials"),
        )
        GameresultFactory(
            gameinfo=orphan, team=TeamFactory(name="Orphan Home"), isHome=True
        )
        GameresultFactory(
            gameinfo=orphan, team=TeamFactory(name="Orphan Away"), isHome=False
        )

        plan = GamedayMigrationService(gameday).build_plan()

        assert len(plan["warnings"]) == 1
        assert (
            plan["warnings"][0]
            == f"Game {orphan.pk} (standing 'Gruppe 1') could not be reliably "
            "matched to a template slot; skipped."
        )
        # The orphan's teams never leak into the mapping.
        assert plan["team_mapping"] == {
            "0_0": {"id": teams["a0"].pk, "label": "A0"},
            "1_0": {"id": teams["b0"].pk, "label": "B0"},
            "0_1": {"id": teams["a1"].pk, "label": "A1"},
            "1_1": {"id": teams["b1"].pk, "label": "B1"},
        }

    def test_tie_break_standing_mismatch_is_skipped_with_warning(self):
        """Two games on the same field sharing an identical `scheduled` time
        collapse to the same slot index in GamedayPlaceholderService's
        chronological matching: with two tied games on the field, both count
        as 2 games-at-or-before their own time, so both resolve to
        field_slots[1] (the 2nd slot) regardless of which is "really" earlier.
        The extra `gi.standing == slot.standing` safety check must catch the
        one that doesn't actually belong there and skip it instead of
        mis-mapping its teams."""
        gameday = GamedayFactory(format="migration_tiebreak")
        template = ScheduleTemplate.objects.create(
            name="Tiebreak Template", num_teams=2, num_fields=1, num_groups=1
        )
        # First slot is unreachable by chronological counting in this tied
        # scenario (both games count to index 2) -- included to make the
        # "collapse onto the same slot" setup realistic.
        TemplateSlot.objects.create(
            template=template,
            field=1,
            slot_order=1,
            stage="Vorrunde",
            standing="Gruppe 9",
        )
        slot2 = TemplateSlot.objects.create(
            template=template,
            field=1,
            slot_order=2,
            stage="Vorrunde",
            standing="Gruppe 1",
            home_group=0,
            home_team=0,
        )
        TemplateApplication.objects.create(
            gameday=gameday, template=template, team_mapping={}
        )

        team = TeamFactory(name="Tiebreak Team")
        # Two games, same field, identical scheduled time, different standing.
        # Both collapse onto slot2 via chronological counting; only the one
        # whose standing actually matches slot2 should be kept.
        gi_matching = GameinfoFactory(
            gameday=gameday,
            field=1,
            scheduled="10:00",
            stage="Vorrunde",
            standing="Gruppe 1",
            officials=team,
        )
        gi_conflicting = GameinfoFactory(
            gameday=gameday,
            field=1,
            scheduled="10:00",
            stage="Vorrunde",
            standing="Gruppe 2",
            officials=team,
        )
        GameresultFactory(gameinfo=gi_matching, team=team, isHome=True)
        GameresultFactory(gameinfo=gi_conflicting, team=team, isHome=True)

        plan = GamedayMigrationService(gameday).build_plan()

        assert plan["warnings"] == [
            f"Game {gi_conflicting.pk} (standing 'Gruppe 2') could not be "
            "reliably matched to a template slot; skipped."
        ]
        assert plan["team_mapping"] == {
            "0_0": {"id": team.pk, "label": "Tiebreak Team"}
        }


class TestConflictingTeamAssignmentRaises(TestCase):
    def test_conflicting_assignment_raises_migration_error(self):
        gameday = GamedayFactory(format="migration_conflict")
        template = ScheduleTemplate.objects.create(
            name="Conflict Template", num_teams=2, num_fields=1, num_groups=1
        )
        slot1 = TemplateSlot.objects.create(
            template=template,
            field=1,
            slot_order=1,
            stage="Vorrunde",
            standing="Gruppe 1",
            home_group=0,
            home_team=0,
        )
        slot2 = TemplateSlot.objects.create(
            template=template,
            field=1,
            slot_order=2,
            stage="Vorrunde",
            standing="Gruppe 1",
            home_group=0,
            home_team=0,
        )
        TemplateApplication.objects.create(
            gameday=gameday, template=template, team_mapping={}
        )

        team_x = TeamFactory(name="Team X")
        team_y = TeamFactory(name="Team Y")
        officials = TeamFactory(name="Conflict Officials")

        gi1 = GameinfoFactory(
            gameday=gameday,
            field=1,
            scheduled="10:00",
            stage="Vorrunde",
            standing="Gruppe 1",
            officials=officials,
        )
        GameresultFactory(gameinfo=gi1, team=team_x, isHome=True)

        gi2 = GameinfoFactory(
            gameday=gameday,
            field=1,
            scheduled="11:10",
            stage="Vorrunde",
            standing="Gruppe 1",
            officials=officials,
        )
        GameresultFactory(gameinfo=gi2, team=team_y, isHome=True)

        # A real gameday's Gameinfo/Gameresult rows can drift from what the
        # *current* resolved template would imply -- games get manually
        # corrected over a season, or the schedule_<format>.json file itself
        # changes after older gamedays were generated from it. When the same
        # group/team slot maps to two different real teams depending on which
        # game you look at, the reconstruction is unreliable: silently
        # keeping "whichever came first" can scramble team identities across
        # the whole canvas (observed on real prod data: a team ends up
        # playing itself). Refusing outright is the safe behavior.
        with pytest.raises(GamedayMigrationError, match="0_0"):
            GamedayMigrationService(gameday).build_plan()


class TestStageCategoryBackfill(TestCase):
    def test_matched_gameinfo_stage_category_is_used_verbatim(self):
        gameday = GamedayFactory(format="migration_stage_category")
        template = ScheduleTemplate.objects.create(
            name="Stage Category Template", num_teams=1, num_fields=1, num_groups=1
        )
        # stage="Vorrunde" would normally derive to "preliminary" via the
        # legacy fallback -- the matched game explicitly overrides that.
        slot = TemplateSlot.objects.create(
            template=template,
            field=1,
            slot_order=1,
            stage="Vorrunde",
            standing="Gruppe 1",
        )
        TemplateApplication.objects.create(
            gameday=gameday, template=template, team_mapping={}
        )
        gi = GameinfoFactory(
            gameday=gameday,
            field=1,
            scheduled="10:00",
            stage="Vorrunde",
            standing="Gruppe 1",
            stage_category=StageCategory.FINAL,
            officials=TeamFactory(),
        )

        plan = GamedayMigrationService(gameday).build_plan()

        assert plan["slots"][0]["stage_category"] == StageCategory.FINAL

    def test_unmatched_slot_falls_back_to_derive_legacy_stage_category(self):
        gameday = GamedayFactory(format="migration_stage_category_fallback")
        template = ScheduleTemplate.objects.create(
            name="Stage Category Fallback Template",
            num_teams=1,
            num_fields=1,
            num_groups=1,
        )
        matched_slot = TemplateSlot.objects.create(
            template=template,
            field=1,
            slot_order=1,
            stage="Vorrunde",
            standing="Gruppe 1",
        )
        unmatched_slot = TemplateSlot.objects.create(
            template=template,
            field=1,
            slot_order=2,
            stage="Finalrunde",
            standing="P1",
        )
        TemplateApplication.objects.create(
            gameday=gameday, template=template, team_mapping={}
        )
        GameinfoFactory(
            gameday=gameday,
            field=1,
            scheduled="10:00",
            stage="Vorrunde",
            standing="Gruppe 1",
            officials=TeamFactory(),
        )

        plan = GamedayMigrationService(gameday).build_plan()

        slots_by_order = {s["slot_order"]: s for s in plan["slots"]}
        assert slots_by_order[1]["stage_category"] == StageCategory.PRELIMINARY
        assert (
            slots_by_order[2]["stage_category"]
            == derive_legacy_stage_category("Finalrunde")
            == StageCategory.FINAL
        )


class TestMissingTeamGracefulSkip(TestCase):
    def test_gameresult_with_null_team_is_skipped_not_crashed(self):
        gameday = GamedayFactory(format="migration_null_team")
        template = ScheduleTemplate.objects.create(
            name="Null Team Template", num_teams=2, num_fields=1, num_groups=1
        )
        slot = TemplateSlot.objects.create(
            template=template,
            field=1,
            slot_order=1,
            stage="Vorrunde",
            standing="Gruppe 1",
            home_group=0,
            home_team=0,
        )
        TemplateApplication.objects.create(
            gameday=gameday, template=template, team_mapping={}
        )

        team = TeamFactory(name="Officials Team")
        gi = GameinfoFactory(
            gameday=gameday,
            field=1,
            scheduled="10:00",
            stage="Vorrunde",
            standing="Gruppe 1",
            officials=team,
        )
        GameresultFactory(gameinfo=gi, team=None, isHome=True)

        plan = GamedayMigrationService(gameday).build_plan()

        assert plan["warnings"] == []
        assert "0_0" not in plan["team_mapping"]


class TestZeroMutation(TestCase):
    @staticmethod
    def _snapshot_hash(gameday):
        def _rows(queryset):
            return list(queryset.order_by("pk").values())

        payload = {
            "gameday": _rows(Gameday.objects.filter(pk=gameday.pk)),
            "gameinfo": _rows(Gameinfo.objects.filter(gameday=gameday)),
            "gameresult": _rows(Gameresult.objects.filter(gameinfo__gameday=gameday)),
            "gameofficial": _rows(
                GameOfficial.objects.filter(gameinfo__gameday=gameday)
            ),
        }
        return hashlib.sha256(
            json.dumps(payload, sort_keys=True, default=str).encode()
        ).hexdigest()

    def test_build_plan_never_mutates_existing_rows(self):
        gameday, _template, _slots, (gi1, gi2), _teams = _build_two_slot_scenario()
        GameOfficialFactory(gameinfo=gi1, position="Referee")

        before = self._snapshot_hash(gameday)
        GamedayMigrationService(gameday).build_plan()
        after = self._snapshot_hash(gameday)

        assert before == after
