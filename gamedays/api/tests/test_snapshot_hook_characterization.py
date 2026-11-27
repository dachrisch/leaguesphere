"""Snapshot hook-boundary characterization (Phase 1, #2537)."""

from __future__ import annotations

from unittest.mock import patch

from django.http import QueryDict
from django.test import TestCase

from gamedays.api.snapshot import parse_snapshot_params, scope_league_season_configs
from gamedays.models import Gameday
from gamedays.tests.setup_factories.db_setup import DBSetup


class SnapshotHookCharacterization(TestCase):
    def test_no_pairs_returns_no_standings_configs(self):
        filters, _ = parse_snapshot_params(QueryDict("year=9999"))
        assert filters["matches_nothing"] is True
        assert scope_league_season_configs(filters) == []

    def test_scope_passes_pairs_to_the_hook(self):
        DBSetup().g62_status_empty()
        gameday = Gameday.objects.first()
        gameday.status = Gameday.STATUS_PUBLISHED
        gameday.save(update_fields=["status"])
        params = QueryDict(f"season={gameday.season_id}&league={gameday.league_id}")
        filters, _ = parse_snapshot_params(params)
        with patch(
            "gamedays.api.snapshot.league_table_hooks.league_season_configs_for_pairs"
        ) as hook:
            hook.return_value = []
            assert scope_league_season_configs(filters) == []
        pairs = hook.call_args.args[0]
        assert isinstance(pairs, set)
        assert pairs == {(gameday.league_id, gameday.season_id)}
