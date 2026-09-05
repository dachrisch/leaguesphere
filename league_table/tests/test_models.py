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


class TestLeagueSeasonConfigOfficialsCheckDefaults(TestCase):
    def test_new_config_has_officials_check_disabled_by_default(self):
        config: LeagueSeasonConfig = LeagueSeasonConfigFactory(
            check_officials_automatically=False
        )

        assert config.check_officials_automatically is False
        assert config.min_officials_per_game == 0
        assert config.min_officials_f4_per_game == 0
        assert config.min_officials_f3_per_game == 0
        assert config.min_officials_f2_per_game == 0
        assert config.min_officials_f1_per_game == 0
