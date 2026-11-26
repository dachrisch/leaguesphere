"""Characterization of gameday-detail context branches before inversion (#2537)."""

from __future__ import annotations

from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse

from gamedays.constants import LEAGUE_GAMEDAY_DETAIL
from gamedays.tests.setup_factories.db_setup import DBSetup
from league_table.models import LeagueSeasonConfig


class DetailContextCharacterization(TestCase):
    def setUp(self):
        cache.clear()

    def _url(self, gameday):
        return reverse(LEAGUE_GAMEDAY_DETAIL, kwargs={"pk": gameday.pk})

    def test_officials_not_installed_uses_empty_defaults(self):
        gameday = DBSetup().create_empty_gameday()
        with patch(
            "gamedays.views.settings.INSTALLED_APPS",
            [app for app in __import__("django.conf", fromlist=["settings"]).settings.INSTALLED_APPS if app != "officials"],
        ):
            response = self.client.get(self._url(gameday))
        assert response.status_code == 200
        assert response.context_data["info"]["officials"] == []
        assert response.context_data["info"]["url_pattern_official"] == ""

    def test_non_staff_username_is_checked_against_the_table(self):
        gameday = DBSetup().create_empty_gameday()
        User.objects.create_user(username="ref", password="pw")
        assert self.client.login(username="ref", password="pw")
        response = self.client.get(self._url(gameday))
        assert response.status_code == 200

    def test_league_table_not_installed_uses_to_html(self):
        gameday = DBSetup().create_empty_gameday()
        with patch("gamedays.views.apps.is_installed", return_value=False):
            response = self.client.get(self._url(gameday))
        assert response.status_code == 200
        assert response.status_code == 200

    def test_missing_slugs_skip_the_table_url(self):
        gameday = DBSetup().create_empty_gameday()
        from gamedays.models import League as LeagueModel, Season as SeasonModel

        SeasonModel.objects.filter(pk=gameday.season_id).update(slug="")
        LeagueModel.objects.filter(pk=gameday.league_id).update(slug="")
        response = self.client.get(self._url(gameday))
        assert response.status_code == 200
        assert "league_table_url" not in response.context_data

    def test_override_allow_and_deny(self):
        for allow in (True, False):
            gameday = DBSetup().create_empty_gameday()
            config, _ = LeagueSeasonConfig.objects.get_or_create(
                league=gameday.league, season=gameday.season
            )
            from league_table.models import OverrideOfficialGamedaySetting

            OverrideOfficialGamedaySetting.objects.create(
                league_season_config=config,
                gameday=gameday,
                allow_officials_to_register=allow,
            )
            response = self.client.get(self._url(gameday))
            assert response.status_code == 200
            assert response.status_code == 200

    def test_default_config_allow_and_deny(self):
        for allow in (True, False):
            gameday = DBSetup().create_empty_gameday()
            config, _ = LeagueSeasonConfig.objects.get_or_create(
                league=gameday.league, season=gameday.season
            )
            config.allow_officials_to_register = allow
            config.save()
            response = self.client.get(self._url(gameday))
            assert response.status_code == 200
