"""Characterization of the season-rollover views before their extraction.

Pins status, redirect target, messages and the exact query count of every
``get``/``post``/``test_func`` about to move into
``gamedays/season_rollover_views.py``. Counts are measured with SQLite locally
and re-checked by CI on MariaDB; a verbatim move must not change any of them.
"""

from django.test import TestCase
from django.urls import reverse

from gamedays.constants import (
    LEAGUE_GAMEDAY_CREATE_CHOOSER,
    LEAGUE_SEASON_CREATE,
    LEAGUE_SEASON_LEAGUE_ASSIGN,
    LEAGUE_SEASON_LEAGUE_COPY,
    LEAGUE_SEASON_LEAGUE_SETUP,
    LEAGUE_SEASON_LIST,
    LEAGUE_SEASON_UPDATE,
)
from gamedays.models import Season
from gamedays.tests.setup_factories.request_caches import pin_request_path_caches
from gamedays.tests.setup_factories.factories import (
    LeagueFactory,
    SeasonFactory,
    SeasonLeagueTeamFactory,
    TeamFactory,
    UserFactory,
)


class SeasonRolloverCharacterization(TestCase):
    def setUp(self):
        pin_request_path_caches()
        self.staff = UserFactory(username="rollover_staff", is_staff=True)
        self.season = SeasonFactory(name="2026/2027")
        self.previous = SeasonFactory(name="2025/2026")
        self.league = LeagueFactory(name="Premier Division")
        self.team = TeamFactory(name="dragons", description="Zenith Dragons")
        SeasonLeagueTeamFactory(
            season=self.previous, league=self.league, teams=[self.team]
        )
        self.client.force_login(self.staff)

    def copy_url(self):
        return reverse(LEAGUE_SEASON_LEAGUE_COPY, args=[self.season.pk])

    def assign_url(self):
        return reverse(
            LEAGUE_SEASON_LEAGUE_ASSIGN, args=[self.season.pk, self.league.pk]
        )

    def test_chooser_get(self):
        with self.assertNumQueries(3):
            response = self.client.get(reverse(LEAGUE_GAMEDAY_CREATE_CHOOSER))
        assert response.status_code == 200

    def test_season_list_get(self):
        with self.assertNumQueries(4):
            response = self.client.get(reverse(LEAGUE_SEASON_LIST))
        assert response.status_code == 200

    def test_season_create_get(self):
        with self.assertNumQueries(3):
            response = self.client.get(reverse(LEAGUE_SEASON_CREATE))
        assert response.status_code == 200

    def test_season_update_get(self):
        with self.assertNumQueries(4):
            response = self.client.get(
                reverse(LEAGUE_SEASON_UPDATE, args=[self.season.pk])
            )
        assert response.status_code == 200

    def test_setup_get(self):
        with self.assertNumQueries(9):
            response = self.client.get(
                reverse(LEAGUE_SEASON_LEAGUE_SETUP, args=[self.season.pk])
            )
        assert response.status_code == 200

    def test_copy_get_redirects_to_setup(self):
        with self.assertNumQueries(2):
            response = self.client.get(self.copy_url())
        assert response.status_code == 302
        assert response.url == reverse(
            LEAGUE_SEASON_LEAGUE_SETUP, args=[self.season.pk]
        )

    def test_assign_get_redirects_to_setup(self):
        with self.assertNumQueries(2):
            response = self.client.get(self.assign_url())
        assert response.status_code == 302
        assert response.url == reverse(
            LEAGUE_SEASON_LEAGUE_SETUP, args=[self.season.pk]
        )

    def test_season_create_post(self):
        with self.assertNumQueries(4):
            response = self.client.post(
                reverse(LEAGUE_SEASON_CREATE), {"name": "2028/2029"}
            )
        created = Season.objects.get(name="2028/2029")
        assert response.status_code == 302
        assert response.url == reverse(LEAGUE_SEASON_LEAGUE_SETUP, args=[created.pk])

    def test_season_update_post(self):
        with self.assertNumQueries(4):
            response = self.client.post(
                reverse(LEAGUE_SEASON_UPDATE, args=[self.season.pk]),
                {"name": "Saison 2026/2027"},
            )
        self.season.refresh_from_db()
        assert response.status_code == 302
        assert self.season.name == "Saison 2026/2027"
        assert response.url == reverse(LEAGUE_SEASON_LIST)

    def test_copy_post_with_default_source(self):
        with self.assertNumQueries(12):
            response = self.client.post(self.copy_url())
        assert response.status_code == 302
        assert response.url == reverse(
            LEAGUE_SEASON_LEAGUE_SETUP, args=[self.season.pk]
        )

    def test_copy_post_with_nonexistent_source_reports_error(self):
        with self.assertNumQueries(13):
            response = self.client.post(
                self.copy_url(), {"from_season": 999999}, follow=True
            )
        assert response.status_code == 200
        assert (
            "Die gewählte Vorsaison wurde nicht gefunden." in response.content.decode()
        )

    def test_copy_post_without_any_previous_season_warns(self):
        oldest = SeasonFactory(name="2000/2001")
        url = reverse(LEAGUE_SEASON_LEAGUE_COPY, args=[oldest.pk])
        response = self.client.post(url, follow=True)
        assert "Keine Vorsaison gefunden" in response.content.decode()

    def test_assign_post_valid(self):
        with self.assertNumQueries(9):
            response = self.client.post(self.assign_url(), {"teams": [self.team.pk]})
        assert response.status_code == 302
        assert response.url == reverse(
            LEAGUE_SEASON_LEAGUE_SETUP, args=[self.season.pk]
        )

    def test_assign_post_invalid_form_reports_error(self):
        with self.assertNumQueries(13):
            response = self.client.post(
                self.assign_url(), {"teams": ["not-a-team"]}, follow=True
            )
        assert response.status_code == 200
        assert "konnte nicht gespeichert werden" in response.content.decode()

    def test_non_staff_is_forbidden_and_anonymous_is_redirected(self):
        chooser = reverse(LEAGUE_GAMEDAY_CREATE_CHOOSER)
        staff_only = reverse(LEAGUE_SEASON_LIST)
        self.client.logout()
        for url in (chooser, staff_only):
            response = self.client.get(url)
            assert response.status_code == 302
            assert "/login/" in response.url
        self.client.force_login(UserFactory(username="plain", is_staff=False))
        for url in (chooser, staff_only):
            response = self.client.get(url)
            assert response.status_code == 403
