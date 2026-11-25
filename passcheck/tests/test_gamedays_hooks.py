"""Tests for passcheck's gamedays hooks (Phase 1, #2537)."""

from __future__ import annotations

from unittest.mock import patch

import pandas as pd
import pytest

from passcheck.service import gamedays_hooks as hooks


def _jersey_rows():
    return [
        {
            "gameday_id": 1,
            "gameday_jersey": 7,
            "playerlist__team_id": 2,
            "playerlist__player__person__first_name": "First",
            "playerlist__player__person__last_name": "Last",
        }
    ]


@pytest.mark.django_db
def test_player_jersey_names_empty_and_populated():
    with patch("passcheck.service.gamedays_hooks.PlayerlistGameday.objects") as objects:
        objects.filter.return_value.values.return_value = []
        assert hooks.player_jersey_names(1).empty
        objects.filter.return_value.values.return_value = _jersey_rows()
        frame = hooks.player_jersey_names(1)
        assert frame["first_name"].iloc[0] == "First"
        assert frame["team_id"].iloc[0] == 2


@pytest.mark.django_db
def test_season_player_jersey_names():
    with patch("passcheck.service.gamedays_hooks.PlayerlistGameday.objects") as objects:
        objects.filter.return_value.values.return_value = []
        assert hooks.season_player_jersey_names("S").empty
        objects.filter.return_value.values.return_value = _jersey_rows()
        assert len(hooks.season_player_jersey_names("S")) == 1


@pytest.mark.django_db
def test_staff_passcheck_details_empty_and_populated():
    with patch(
        "passcheck.service.gamedays_hooks.PasscheckVerification.objects"
    ) as objects:
        objects.filter.return_value.values.return_value = []
        assert list(hooks.staff_passcheck_details(1).columns) == [
            "Zeitpunkt",
            "Schiedsrichter",
            "Account",
            "Team",
            "Notiz",
        ]
        objects.filter.return_value.values.return_value = [
            {
                "created_at": pd.Timestamp("2026-01-01"),
                "official_name": "A",
                "user__username": "u",
                "team__description": "T",
                "note": "a\nb",
            }
        ]
        assert "</br>" in hooks.staff_passcheck_details(1)["Notiz"].iloc[0]


def test_register_registers_all_hooks():
    with patch("passcheck.service.gamedays_hooks.registry.register") as register:
        hooks.register()
    assert register.call_count == 3
