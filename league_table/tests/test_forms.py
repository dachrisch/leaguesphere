from django.test import TestCase

from league_table.forms import LeagueSeasonConfigForm
from league_table.models import LeagueSeasonConfig
from league_table.tests.setup_factories.factories_leaguetable import (
    LeagueSeasonConfigFactory,
)


class TestLeagueSeasonConfigFormTableModeValidation(TestCase):
    def _form_data(self, config, **overrides):
        data = {
            "league": config.league_id,
            "season": config.season_id,
            "ruleset": config.ruleset_id,
            "table_mode": LeagueSeasonConfig.TABLE_MODE_DEFAULT,
            "table_mode_top_n": "",
            "team_point_adjustments": [],
            "officials_per_gameday_per_field": 0,
            "officials_per_gameday_number": 0,
            "top_n_players_in_gameday_statistics": 10,
            "top_n_players_in_season_statistics": 10,
        }
        data.update(overrides)
        return data

    def test_default_mode_without_top_n_is_valid(self):
        config = LeagueSeasonConfigFactory()

        form = LeagueSeasonConfigForm(data=self._form_data(config), instance=config)
        form.is_valid()

        assert "table_mode_top_n" not in form.errors

    def test_top_n_gamedays_mode_without_top_n_is_invalid(self):
        config = LeagueSeasonConfigFactory()

        form = LeagueSeasonConfigForm(
            data=self._form_data(
                config,
                table_mode=LeagueSeasonConfig.TABLE_MODE_TOP_N_GAMEDAYS,
                table_mode_top_n="",
            ),
            instance=config,
        )

        assert not form.is_valid()
        assert "table_mode_top_n" in form.errors

    def test_top_n_games_mode_with_top_n_is_valid(self):
        config = LeagueSeasonConfigFactory()

        form = LeagueSeasonConfigForm(
            data=self._form_data(
                config,
                table_mode=LeagueSeasonConfig.TABLE_MODE_TOP_N_GAMES,
                table_mode_top_n=5,
            ),
            instance=config,
        )
        form.is_valid()

        assert "table_mode_top_n" not in form.errors
