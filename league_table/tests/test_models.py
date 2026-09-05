from django.core.exceptions import ValidationError
from django.test import TestCase

from gamedays.service.wrapper.gameinfo_wrapper import GameinfoWrapper
from gamedays.tests.setup_factories.factories import GameinfoFactory
from league_table.models import LeagueGroup, LeagueRuleset, LeagueSeasonConfig
from league_table.tests.setup_factories.factories_leaguetable import (
    LeagueGroupFactory,
    LeagueSeasonConfigFactory,
)


class TestGameinfoWrapperWithLeagueTableDependencies(TestCase):
    def test_delete_by_gameday(self):
        group: LeagueGroup = LeagueGroupFactory.create()
        gameinfo = GameinfoFactory.create()
        assert gameinfo.league_group is None
        assert gameinfo.standing == ""
        gameinfo_wrapper = GameinfoWrapper(gameinfo)
        gameinfo_wrapper.update_standing(group.pk)
        gameinfo.refresh_from_db()
        assert gameinfo.standing == group.name
        assert gameinfo.league_group == group


class TestLeagueSeasonConfigTableModeValidation(TestCase):
    def test_default_mode_without_top_n_is_valid(self):
        config = LeagueSeasonConfigFactory(
            table_mode=LeagueSeasonConfig.TABLE_MODE_DEFAULT, table_mode_top_n=None
        )
        config.full_clean(exclude=["ruleset"])

    def test_top_n_gamedays_mode_without_top_n_is_invalid(self):
        config = LeagueSeasonConfigFactory(
            table_mode=LeagueSeasonConfig.TABLE_MODE_TOP_N_GAMEDAYS,
            table_mode_top_n=None,
        )
        with self.assertRaises(ValidationError):
            config.full_clean(exclude=["ruleset"])

    def test_top_n_games_mode_with_top_n_is_valid(self):
        config = LeagueSeasonConfigFactory(
            table_mode=LeagueSeasonConfig.TABLE_MODE_TOP_N_GAMES, table_mode_top_n=5
        )
        config.full_clean(exclude=["ruleset"])
