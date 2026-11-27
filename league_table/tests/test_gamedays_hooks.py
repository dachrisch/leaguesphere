"""Tests for league_table's gamedays hooks (Phase 1, #2537)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from league_table.models import LeagueGroup, LeagueRuleset, LeagueSeasonConfig
from league_table.service import gamedays_hooks as hooks
from gamedays.models import Gameday
from gamedays.tests.setup_factories.db_setup import DBSetup


@pytest.mark.django_db
def test_season_settings_with_a_configured_ruleset():
    ruleset = LeagueRuleset.objects.create(name="Ruleset")
    DBSetup().g62_status_empty()
    gameday = Gameday.objects.first()
    config = LeagueSeasonConfig.objects.create(
        league=gameday.league,
        season=gameday.season,
        ruleset=ruleset,
    )
    league, season = config.league, config.season
    configured, resolved = hooks.season_settings(league, season)
    assert configured.pk == config.pk
    assert resolved.pk == ruleset.pk


@pytest.mark.django_db
def test_season_settings_without_a_config():
    with patch.object(
        LeagueSeasonConfig.objects, "get", side_effect=LeagueSeasonConfig.DoesNotExist
    ):
        assert hooks.season_settings(object(), object()) == (None, None)


@pytest.mark.django_db
def test_season_settings_ruleset_fallback():
    class BrokenRulesetConfig:
        @property
        def ruleset(self):
            raise LeagueRuleset.DoesNotExist

    config = BrokenRulesetConfig()
    with (
        patch(
            "league_table.service.gamedays_hooks.LeagueSeasonConfig.objects.get",
            return_value=config,
        ),
        patch(
            "league_table.service.gamedays_hooks.LeagueRuleset.objects.get",
            return_value="fallback",
        ),
    ):
        assert hooks.season_settings(object(), object()) == (config, "fallback")


@pytest.mark.django_db
def test_season_settings_without_any_ruleset():
    class BrokenRulesetConfig:
        @property
        def ruleset(self):
            raise LeagueRuleset.DoesNotExist

    with (
        patch(
            "league_table.service.gamedays_hooks.LeagueSeasonConfig.objects.get",
            return_value=BrokenRulesetConfig(),
        ),
        patch(
            "league_table.service.gamedays_hooks.LeagueRuleset.objects.get",
            side_effect=LeagueRuleset.DoesNotExist,
        ),
    ):
        config, ruleset = hooks.season_settings(object(), object())
        assert ruleset is None
        assert config is not None


@pytest.mark.django_db
def test_season_config_missing():
    with patch(
        "league_table.service.gamedays_hooks.LeagueSeasonConfig.objects.get",
        side_effect=LeagueSeasonConfig.DoesNotExist,
    ):
        assert hooks.season_config("L", "S") is None


def test_ranking_engines_are_called_with_the_ruleset():
    games = pd.DataFrame([{"standing": "A"}])
    ruleset = object()
    with (
        patch(
            "league_table.service.gamedays_hooks.LeagueConfigRuleset.from_ruleset",
            return_value="config",
        ) as from_ruleset,
        patch("league_table.service.gamedays_hooks.TieBreakerEngine") as engine,
    ):
        engine.return_value.rank_by_games.return_value = games
        assert hooks.rank_by_games(games, ruleset) is games
        from_ruleset.assert_called_once_with(ruleset)
    with (
        patch(
            "league_table.service.gamedays_hooks.LeagueConfigRuleset.from_ruleset",
            return_value="config",
        ),
        patch("league_table.service.gamedays_hooks.FinalRankingEngine") as engine,
    ):
        engine.return_value.compute_final_table.return_value = games
        assert hooks.compute_final_table(games, ruleset) is games


def test_settings_helpers():
    config = MagicMock()
    config.get_gameday_statistic_settings.return_value = {"show": True}
    config.get_season_statistic_settings.return_value = {"show": False}
    assert hooks.gameday_statistic_settings(config) == {"show": True}
    assert hooks.season_statistic_settings(config) == {"show": False}
    assert hooks.show_player_names({"show_player_names": True}) is True
    assert hooks.top_n_player({}) == 10
    assert hooks.top_n_player({"top_n_players": 3}) == 3


def test_register_registers_all_hooks():
    with patch("league_table.service.gamedays_hooks.registry.register") as register:
        hooks.register()
    assert register.call_count == 13


@pytest.mark.django_db
def test_snapshot_hooks_delegate():
    configs = [object()]
    with (
        patch(
            "league_table.service.gamedays_hooks._standing_state_parts",
            return_value={"1": 2},
        ) as state,
        patch(
            "league_table.service.gamedays_hooks._build_standings", return_value=[]
        ) as standings,
    ):
        assert hooks.standing_state_parts(configs) == {"1": 2}
        assert hooks.build_standings(configs) == []
        state.assert_called_once_with(configs)
        standings.assert_called_once_with(configs)


@pytest.mark.django_db
def test_league_season_configs_for_pairs():
    DBSetup().g62_status_empty()
    gameday = Gameday.objects.first()
    config = LeagueSeasonConfig.objects.create(
        league=gameday.league, season=gameday.season
    )
    result = hooks.league_season_configs_for_pairs(
        {(gameday.league_id, gameday.season_id)}
    )
    assert [item.pk for item in result] == [config.pk]
    result = hooks.league_season_configs_for_pairs({(-1, -1)})
    assert result == []


@pytest.mark.django_db
def test_group_hooks():
    DBSetup().g62_status_empty()
    gameday = Gameday.objects.first()
    group = LeagueGroup.objects.create(
        league=gameday.league, season=gameday.season, name="Gruppe A"
    )
    assert hooks.group_options([group.pk]) == [(group.pk, "Gruppe A")]
    assert hooks.group_by_id(group.pk).pk == group.pk
    assert hooks.group_by_id(-1) is None
