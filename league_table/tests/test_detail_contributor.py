"""Tests for the league_table detail contributor (Phase 1, #2537)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from league_table.models import LeagueSeasonConfig, OverrideOfficialGamedaySetting
from league_table.service import gamedays_hooks as hooks


def _draft(slug="s", league_slug="l"):
    return SimpleNamespace(
        gameday=SimpleNamespace(
            pk=1,
            league=SimpleNamespace(name="L", slug=league_slug),
            season=SimpleNamespace(name="S", slug=slug),
        ),
        context={},
        config={},
        qualify_table="qualify",
        final_table="final",
        allow_officials_to_register=None,
    )


@pytest.mark.django_db
def test_detail_contributor_without_a_config():
    draft = _draft()
    with (
        patch(
            "league_table.service.gamedays_hooks.LeagueSeasonConfig.objects.get",
            side_effect=LeagueSeasonConfig.DoesNotExist,
        ),
        patch(
            "gamedays.service.builders.TableContextBuilder.build",
            side_effect=lambda x: x,
        ),
        patch(
            "league_table.service.gamedays_hooks.LeagueTableRepository.get_league_season_config_by_slug",
            side_effect=LeagueSeasonConfig.DoesNotExist,
        ),
    ):
        hooks.detail_contributor(draft)
    assert draft.config == {}
    assert draft.allow_officials_to_register is False
    assert "league_table_url" in draft.context


@pytest.mark.django_db
def test_detail_contributor_without_slugs():
    draft = _draft(slug="", league_slug="")
    with (
        patch(
            "league_table.service.gamedays_hooks.LeagueSeasonConfig.objects.get",
            side_effect=LeagueSeasonConfig.DoesNotExist,
        ),
        patch(
            "gamedays.service.builders.TableContextBuilder.build",
            side_effect=lambda x: x,
        ),
    ):
        hooks.detail_contributor(draft)
    assert draft.context == {}
    assert draft.allow_officials_to_register is None


@pytest.mark.django_db
def test_detail_contributor_override_and_default_policy():
    for source in ("override", "default"):
        draft = _draft()
        config = MagicMock()
        if source == "override":
            config.overrideofficialgamedaysetting_set.get.return_value = (
                SimpleNamespace(allow_officials_to_register=True)
            )
        else:
            config.overrideofficialgamedaysetting_set.get.side_effect = (
                OverrideOfficialGamedaySetting.DoesNotExist
            )
            config.allow_officials_to_register = False
        config.get_gameday_statistic_settings.return_value = {"show": True}
        with (
            patch(
                "league_table.service.gamedays_hooks.LeagueSeasonConfig.objects.get",
                return_value=config,
            ),
            patch(
                "gamedays.service.builders.TableContextBuilder.build",
                side_effect=lambda x: x,
            ),
            patch(
                "league_table.service.gamedays_hooks.LeagueTableRepository.get_league_season_config_by_slug",
                return_value=config,
            ),
        ):
            hooks.detail_contributor(draft)
        assert draft.allow_officials_to_register is (source == "override")
