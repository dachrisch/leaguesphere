"""Branches in moved functions whose def/signature lines changed (Phase 1)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from gamedays.service.placeholder_service import GamedayPlaceholderService
from gamedays.service.schedule_resolution_service import (
    GamedayScheduleResolutionService,
)


def _rule(role):
    rule = SimpleNamespace(id=1, slot=SimpleNamespace(field=1, stage="S", standing="X"))
    rule.team_rules = MagicMock()
    rule.team_rules.all.return_value = [
        SimpleNamespace(id=2, place=1, standing="X", points=0, role=role)
    ]
    return rule


def test_apply_rule_skips_when_no_target_gameinfo():
    service = GamedayScheduleResolutionService.__new__(GamedayScheduleResolutionService)
    service.gameday = object()
    with patch("gamedays.service.schedule_resolution_service.Gameinfo") as gameinfo:
        gameinfo.objects.filter.return_value.count.return_value = 0
        service._apply_rule(_rule("home"))


@pytest.mark.parametrize(
    "role,already_official", [("official", True), ("unknown", False)]
)
def test_apply_rule_skips_unknown_role_and_unchanged_official(role, already_official):
    service = GamedayScheduleResolutionService.__new__(GamedayScheduleResolutionService)
    service.gameday = object()
    service.gmw = MagicMock()
    service.gmw.get_team_by.return_value = "A"
    team = SimpleNamespace(pk=1, description="A")
    target = MagicMock()
    target.officials = team if already_official else None

    with (
        patch("gamedays.service.schedule_resolution_service.Gameinfo") as gameinfo,
        patch("gamedays.service.schedule_resolution_service.Team") as teams,
    ):
        queryset = gameinfo.objects.filter.return_value
        queryset.count.return_value = 1
        queryset.first.return_value = target
        teams.objects.get.return_value = team
        service._apply_rule(_rule(role))

    if role == "official" and already_official:
        target.save.assert_not_called()


@pytest.mark.parametrize("n_games,n_slots", [(0, 1), (1, 0), (2, 1)])
def test_find_slot_for_game_returns_none_outside_the_slot_range(n_games, n_slots):
    service = GamedayPlaceholderService.__new__(GamedayPlaceholderService)
    service._gameinfos = {
        index: SimpleNamespace(field=1, scheduled=index) for index in range(n_games)
    }
    service._get_slots_by_field = lambda: {1: list(range(n_slots))}
    assert service._find_slot_for_game(SimpleNamespace(field=1, scheduled=100)) is None
