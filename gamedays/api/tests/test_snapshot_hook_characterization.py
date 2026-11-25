"""Snapshot hook-boundary characterization (Phase 1, #2537)."""

from __future__ import annotations

from django.http import QueryDict
from django.test import TestCase

from gamedays.api.snapshot import parse_snapshot_params, scope_league_season_configs


class SnapshotHookCharacterization(TestCase):
    def test_no_pairs_returns_no_standings_configs(self):
        filters, _ = parse_snapshot_params(QueryDict("year=9999"))
        assert filters["matches_nothing"] is True
        assert scope_league_season_configs(filters) == []
