"""Wizard and standing characterization before the LeagueGroup inversion (#2537)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from gamedays.wizard.gameinfo import GAMEINFO_STEP, GameinfoStepHandler
from gamedays.wizard.field_group import FIELD_GROUP_STEP
from gamedays.wizard.gameday_format import (
    GAMEDAY_FORMAT_STEP,
    GamedayFormatStepHandler,
)
from league_table.models import LeagueGroup


def test_gameday_format_uses_selected_league_groups():
    form = SimpleNamespace(
        fields={
            "group": SimpleNamespace(label=""),
            "group_name": SimpleNamespace(initial=""),
            "league_group": SimpleNamespace(initial=None),
        }
    )
    wizard = SimpleNamespace(
        wizard_state={
            FIELD_GROUP_STEP: {
                "group_names": [7],
                "format": "4_1",
            }
        }
    )
    with (
        patch(
            "gamedays.wizard.gameday_format.get_gameday_format_formset",
            return_value=[form],
        ),
        patch(
            "gamedays.service.league_group_hooks.group_options",
            return_value=[(7, "Gruppe A")],
        ),
    ):
        result = GamedayFormatStepHandler().handle_form(wizard, None, None)
    assert result == [form]
    assert form.fields["group"].label == "Gruppe A"
    assert form.fields["league_group"].initial == 7


@pytest.mark.django_db
def test_gameinfo_step_uses_league_group_names_when_no_number_given():
    from gamedays.models import Gameday

    gameday = Gameday.objects.first()
    if gameday is None:
        from gamedays.tests.setup_factories.db_setup import DBSetup

        gameday = DBSetup().g62_status_empty()
        gameday = Gameday.objects.first()
    group = LeagueGroup.objects.create(
        league=gameday.league, season=gameday.season, name="Gruppe A"
    )
    wizard = SimpleNamespace(
        gameday=MagicMock(),
        wizard_state={
            FIELD_GROUP_STEP: {"number_fields": "1", "group_names": [group.pk]}
        },
    )
    formset = MagicMock()
    with (
        patch(
            "gamedays.wizard.gameinfo.get_gameinfo_formset",
            return_value=lambda *a, **k: formset,
        ),
        patch("gamedays.wizard.gameinfo.Gameinfo.objects.filter", return_value=[]),
    ):
        result = GameinfoStepHandler().handle_form(wizard, None, None)
    assert result is formset


def test_gameday_format_rejects_a_mismatched_group_count():
    wizard = SimpleNamespace(
        wizard_state={FIELD_GROUP_STEP: {"group_names": [7, 8], "format": "4_1"}}
    )
    with pytest.raises(ValueError, match="ungleiche Anzahl"):
        GamedayFormatStepHandler().handle_form(wizard, None, None)
