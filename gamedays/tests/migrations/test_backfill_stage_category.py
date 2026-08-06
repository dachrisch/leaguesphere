import importlib

from django.test import TestCase

from gamedays.models import Gameinfo, GamedayDesignerState
from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import GameinfoFactory

_migration = importlib.import_module("gamedays.migrations.0041_backfill_stage_category")


class TestBackfillStageCategory(TestCase):
    def test_backfills_from_designer_state_when_present(self):
        gameday = DBSetup().create_empty_gameday()
        gi_preliminary = GameinfoFactory(gameday=gameday, stage="Liga")
        gi_final = GameinfoFactory(gameday=gameday, stage="Playoffs")
        # bypass the Task 2 save() fallback to simulate pre-migration data
        Gameinfo.objects.filter(pk__in=[gi_preliminary.pk, gi_final.pk]).update(
            stage_category=""
        )
        GamedayDesignerState.objects.create(
            gameday=gameday,
            state_data={
                "nodes": [
                    {
                        "type": "stage",
                        "data": {"name": "Liga", "category": "preliminary"},
                    },
                    {
                        "type": "stage",
                        "data": {"name": "Playoffs", "category": "final"},
                    },
                ]
            },
        )

        _migration.backfill_stage_category(apps_module=None, schema_editor=None)

        gi_preliminary.refresh_from_db()
        gi_final.refresh_from_db()
        assert gi_preliminary.stage_category == "preliminary"
        assert gi_final.stage_category == "final"

    def test_backfills_from_legacy_heuristic_when_no_designer_state(self):
        gameday = DBSetup().create_empty_gameday()
        gi = GameinfoFactory(gameday=gameday, stage="Hauptrunde")
        Gameinfo.objects.filter(pk=gi.pk).update(stage_category="")

        _migration.backfill_stage_category(apps_module=None, schema_editor=None)

        gi.refresh_from_db()
        assert gi.stage_category == "preliminary"

    def test_leaves_already_populated_rows_untouched(self):
        gameday = DBSetup().create_empty_gameday()
        gi = GameinfoFactory(gameday=gameday, stage="Liga")
        Gameinfo.objects.filter(pk=gi.pk).update(stage_category="custom")
        GamedayDesignerState.objects.create(
            gameday=gameday,
            state_data={
                "nodes": [
                    {"type": "stage", "data": {"name": "Liga", "category": "preliminary"}}
                ]
            },
        )

        _migration.backfill_stage_category(apps_module=None, schema_editor=None)

        gi.refresh_from_db()
        assert gi.stage_category == "custom"
