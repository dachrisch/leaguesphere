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
    assert register.call_count == 6


def test_annotate_passcheck_uses_result_ids():
    from unittest.mock import patch

    games = [
        {
            "id": 1,
            "id_home": "10",
            "id_away": "11",
        }
    ]
    with (
        patch("passcheck.service.gamedays_hooks.Gameresult.objects") as results,
        patch(
            "passcheck.service.gamedays_hooks.PasscheckVerification.objects"
        ) as verifications,
    ):
        results.filter.return_value.values_list.return_value = [(10, 2), (11, 3)]
        verifications.filter.return_value.values_list.return_value = [2, 3]
        hooks.annotate_passcheck(games, 9)
        assert games[0]["passcheck"] is True


def test_verified_team_ids_with_and_without_a_filter():
    with patch(
        "passcheck.service.gamedays_hooks.PasscheckVerification.objects"
    ) as verifications:
        verifications.filter.return_value.values_list.return_value = [2, 3]
        verifications.filter.return_value.filter.return_value.values_list.return_value = [
            2
        ]
        assert hooks.verified_team_ids(9) == {2, 3}
        assert hooks.verified_team_ids(9, [2]) == {2}
    verifications.filter.assert_called_with(gameday_id=9)
    verifications.filter.return_value.filter.assert_called_once_with(team_id__in=[2])


@pytest.mark.django_db
def test_verified_team_ids_pins_the_team_filter_with_real_rows():
    from passcheck.models import PasscheckVerification

    from gamedays.tests.setup_factories.db_setup import DBSetup
    from gamedays.tests.setup_factories.factories import TeamFactory

    gameday = DBSetup().create_empty_gameday()
    teams = [TeamFactory(), TeamFactory()]
    for team in teams:
        PasscheckVerification.objects.create(gameday=gameday, team=team)
    assert hooks.verified_team_ids(gameday.pk, [teams[0].pk]) == {teams[0].pk}
    assert hooks.verified_team_ids(gameday.pk) == {team.pk for team in teams}


def test_roster_rows_filters_by_join_and_leave_dates():
    from django.db.models import Q

    with patch("passcheck.service.gamedays_hooks.PlayerlistGameday.objects") as objects:
        scoped = objects.filter.return_value
        joined = scoped.filter.return_value
        active = joined.filter.return_value
        active.select_related.return_value = ["row"]
        assert hooks.roster_rows(9, [2], "2030-01-01") == ["row"]
    objects.filter.assert_called_once_with(gameday_id=9, playerlist__team_id__in=[2])
    scoped.filter.assert_called_once_with(playerlist__joined_on__lte="2030-01-01")
    joined.filter.assert_called_once_with(
        Q(playerlist__left_on__isnull=True) | Q(playerlist__left_on__gt="2030-01-01")
    )
