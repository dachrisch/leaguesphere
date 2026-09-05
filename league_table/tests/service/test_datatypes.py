from django.test import TestCase

from gamedays.models import GamedayDesignerState
from gamedays.tests.setup_factories.factories import GamedayFactory
from league_table.models import LeagueSeasonConfig
from league_table.service.datatypes import LeagueConfig
from league_table.tests.setup_factories.factories_leaguetable import (
    LeagueSeasonConfigFactory,
)


class TestLeagueConfigCollapseStanding(TestCase):
    def test_collapse_true_when_league_season_has_designer_gameday(self):
        config = LeagueSeasonConfigFactory()
        gameday = GamedayFactory(league=config.league, season=config.season)
        GamedayDesignerState.objects.create(gameday=gameday, state_data={})

        league_config = LeagueConfig.from_league_season_config(config)

        assert league_config.collapse_standing_to_league is True

    def test_collapse_false_when_only_classic_gamedays(self):
        config = LeagueSeasonConfigFactory()
        GamedayFactory(league=config.league, season=config.season)

        league_config = LeagueConfig.from_league_season_config(config)

        assert league_config.collapse_standing_to_league is False

    def test_collapse_false_when_designer_gameday_is_excluded(self):
        config = LeagueSeasonConfigFactory()
        gameday = GamedayFactory(league=config.league, season=config.season)
        GamedayDesignerState.objects.create(gameday=gameday, state_data={})
        config.exclude_gamedays.add(gameday)

        league_config = LeagueConfig.from_league_season_config(config)

        assert league_config.collapse_standing_to_league is False


class TestLeagueConfigTableMode(TestCase):
    def test_defaults_to_table_mode_default_with_no_top_n(self):
        config = LeagueSeasonConfigFactory()

        league_config = LeagueConfig.from_league_season_config(config)

        assert league_config.table_mode == LeagueSeasonConfig.TABLE_MODE_DEFAULT
        assert league_config.table_mode_top_n is None

    def test_copies_top_n_gamedays_mode_and_value(self):
        config = LeagueSeasonConfigFactory(
            table_mode=LeagueSeasonConfig.TABLE_MODE_TOP_N_GAMEDAYS,
            table_mode_top_n=3,
        )

        league_config = LeagueConfig.from_league_season_config(config)

        assert league_config.table_mode == LeagueSeasonConfig.TABLE_MODE_TOP_N_GAMEDAYS
        assert league_config.table_mode_top_n == 3
