from http import HTTPStatus

import pytest
from django.core.cache import cache
from django.urls import NoReverseMatch
from django_webtest import WebTest
from rest_framework.reverse import reverse

from gamedays.tests.setup_factories.db_setup import DBSetup
from gamedays.tests.setup_factories.factories import (
    TeamFactory,
    GamedayFactory,
    GameinfoFactory,
    GameOfficialFactory,
)
from officials.tests.setup_factories.factories_officials import OfficialFactory
from officials.urls import (
    OFFICIALS_GAME_OFFICIALS_APPEARANCE,
    OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_YEAR,
    OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_TEAM,
    OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_TEAM_AND_YEAR,
)


class TestGameOfficialListUrls(WebTest):
    """Regression tests for https://github.com/dachrisch/leaguesphere/issues/1966.

    The gamelist route used to be a single re_path with two independently
    optional groups, so reversing it with only one of pk/season silently
    produced a double-slash URL (team//gamelist/... or gamelist//) which the
    reverse proxy normalizes into a non-resolving path -> branded 404.
    The route is now split into explicit path() patterns; every reverse
    must produce a clean, resolving URL.
    """

    def setUp(self):
        # GameOfficialListView.get is cache_page-decorated - clear so tests
        # don't see another test's cached response.
        cache.clear()
        self.team = TeamFactory(name="Adler", description="Adler Hamburg")
        association = DBSetup().create_new_association()
        official = OfficialFactory(
            first_name="Max",
            last_name="Mustermann",
            team=self.team,
            association=association,
            external_id="1",
        )
        gameday = GamedayFactory(date="2025-05-01")
        gameinfo = GameinfoFactory(gameday=gameday)
        GameOfficialFactory(gameinfo=gameinfo, position="Referee", official=official)

    def tearDown(self):
        cache.clear()

    def test_reverses_contain_no_double_slash(self):
        urls = [
            reverse(OFFICIALS_GAME_OFFICIALS_APPEARANCE),
            reverse(
                OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_YEAR,
                kwargs={"season": 2025},
            ),
            reverse(
                OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_TEAM,
                kwargs={"pk": self.team.pk},
            ),
            reverse(
                OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_TEAM_AND_YEAR,
                kwargs={"pk": self.team.pk, "season": 2025},
            ),
        ]
        assert urls == [
            "/officials/einsaetze/",
            "/officials/einsaetze/2025/",
            f"/officials/team/{self.team.pk}/gamelist/",
            f"/officials/team/{self.team.pk}/gamelist/2025/",
        ]
        for url in urls:
            assert "//" not in url

    def test_combined_route_requires_both_kwargs(self):
        # Partial reverses must fail loudly instead of silently
        # producing a double-slash URL.
        with pytest.raises(NoReverseMatch):
            reverse(
                OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_TEAM_AND_YEAR,
                kwargs={"season": 2025},
            )
        with pytest.raises(NoReverseMatch):
            reverse(
                OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_TEAM_AND_YEAR,
                kwargs={"pk": self.team.pk},
            )

    def test_all_gamelist_routes_return_200(self):
        for url in [
            reverse(OFFICIALS_GAME_OFFICIALS_APPEARANCE),
            reverse(
                OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_YEAR,
                kwargs={"season": 2025},
            ),
            reverse(
                OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_TEAM,
                kwargs={"pk": self.team.pk},
            ),
            reverse(
                OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_TEAM_AND_YEAR,
                kwargs={"pk": self.team.pk, "season": 2025},
            ),
        ]:
            response = self.app.get(url)
            assert response.status_code == HTTPStatus.OK

    def test_year_filter_on_team_less_page_links_to_valid_season_urls(self):
        response = self.app.get(reverse(OFFICIALS_GAME_OFFICIALS_APPEARANCE))
        content = response.content.decode()
        assert "team//gamelist" not in content
        assert "gamelist//" not in content
        year_url = reverse(
            OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_YEAR,
            kwargs={"season": 2025},
        )
        assert year_url in content
        follow_up = self.app.get(year_url)
        assert follow_up.status_code == HTTPStatus.OK

    def test_team_navigation_links_to_valid_team_gamelist_url(self):
        response = self.app.get(
            reverse(
                OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_TEAM_AND_YEAR,
                kwargs={"pk": self.team.pk, "season": 2025},
            )
        )
        content = response.content.decode()
        assert "gamelist//" not in content
        team_url = reverse(
            OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_TEAM,
            kwargs={"pk": self.team.pk},
        )
        assert team_url in content
        follow_up = self.app.get(team_url)
        assert follow_up.status_code == HTTPStatus.OK
        # Year links on the team page point at team+season URLs.
        assert (
            reverse(
                OFFICIALS_GAME_OFFICIALS_APPEARANCE_FOR_TEAM_AND_YEAR,
                kwargs={"pk": self.team.pk, "season": 2025},
            )
            in content
        )
