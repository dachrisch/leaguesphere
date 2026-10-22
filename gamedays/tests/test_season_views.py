from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from gamedays.constants import (
    LEAGUE_GAMEDAY_CREATE,
    LEAGUE_SEASON_CREATE,
    LEAGUE_SEASON_LEAGUE_ASSIGN,
    LEAGUE_SEASON_LEAGUE_COPY,
    LEAGUE_SEASON_LEAGUE_SETUP,
    LEAGUE_SEASON_LIST,
    LEAGUE_SEASON_UPDATE,
)
from gamedays.models import Season, SeasonLeagueTeam
from gamedays.tests.setup_factories.factories import (
    LeagueFactory,
    SeasonFactory,
    SeasonLeagueTeamFactory,
    TeamFactory,
    UserFactory,
)

DESIGNER_INDEX = "gameday_designer_app:index"


def _season_urls(season: Season, league) -> list[str]:
    return [
        reverse(LEAGUE_SEASON_LIST),
        reverse(LEAGUE_SEASON_CREATE),
        reverse(LEAGUE_SEASON_UPDATE, args=[season.pk]),
        reverse(LEAGUE_SEASON_LEAGUE_SETUP, args=[season.pk]),
        reverse(LEAGUE_SEASON_LEAGUE_COPY, args=[season.pk]),
        reverse(LEAGUE_SEASON_LEAGUE_ASSIGN, args=[season.pk, league.pk]),
    ]


class SeasonViewTestBase(TestCase):
    def setUp(self):
        self.staff = UserFactory(username="season_staff_user")
        self.season = SeasonFactory(name="2026/2027")
        self.league = LeagueFactory(name="Premier Division")


class TestSeasonPermissions(SeasonViewTestBase):
    def test_anonymous_is_redirected_to_login_on_every_route(self):
        for url in _season_urls(self.season, self.league):
            response = self.client.get(url)
            assert response.status_code == 302, url
            assert "/login/" in response.url, url

    def test_non_staff_is_forbidden_on_every_route(self):
        self.client.force_login(
            UserFactory(username="season_plain_user", is_staff=False)
        )

        for url in _season_urls(self.season, self.league):
            response = self.client.get(url)
            assert response.status_code == 403, url

    def test_non_staff_cannot_post_either(self):
        self.client.force_login(
            UserFactory(username="season_plain_user_2", is_staff=False)
        )

        response = self.client.post(
            reverse(LEAGUE_SEASON_CREATE), data={"name": "2028/2029"}
        )

        assert response.status_code == 403
        assert not Season.objects.filter(name="2028/2029").exists()


class TestSeasonListView(SeasonViewTestBase):
    def test_lists_seasons_for_staff(self):
        SeasonFactory(name="2025/2026")
        self.client.force_login(self.staff)

        response = self.client.get(reverse(LEAGUE_SEASON_LIST))

        assert response.status_code == 200
        assert "gamedays/season/list.html" in [t.name for t in response.templates]
        names = [season.name for season in response.context["seasons"]]
        assert names == ["2026/2027", "2025/2026"]

    def test_shows_assignment_and_gameday_counts(self):
        SeasonLeagueTeamFactory(
            season=self.season,
            league=self.league,
            teams=[
                TeamFactory(name="dragons", description="Zenith Dragons"),
                TeamFactory(name="wolves", description="Quantum Wolves"),
            ],
        )
        self.client.force_login(self.staff)

        response = self.client.get(reverse(LEAGUE_SEASON_LIST))

        row = response.context["seasons"][0]
        assert row.league_count == 1
        assert row.team_count == 2

    def test_query_count_does_not_grow_with_the_number_of_seasons(self):
        self.client.force_login(self.staff)
        url = reverse(LEAGUE_SEASON_LIST)
        self.client.get(url)  # warm middleware/menu caches

        with CaptureQueriesContext(connection) as small:
            self.client.get(url)

        for index in range(10):
            season = SeasonFactory(name=f"saison-{index:02d}")
            SeasonLeagueTeamFactory(
                season=season,
                league=LeagueFactory(name=f"liga-{index:02d}"),
                teams=[TeamFactory(name=f"team-{index:02d}")],
            )

        with CaptureQueriesContext(connection) as large:
            self.client.get(url)

        assert len(large) == len(small)


class TestSeasonCreateView(SeasonViewTestBase):
    def setUp(self):
        super().setUp()
        self.client.force_login(self.staff)

    def test_renders_the_form(self):
        response = self.client.get(reverse(LEAGUE_SEASON_CREATE))

        assert response.status_code == 200
        assert "gamedays/season/form.html" in [t.name for t in response.templates]

    def test_creates_a_season_with_a_derived_slug(self):
        response = self.client.post(
            reverse(LEAGUE_SEASON_CREATE), data={"name": "2027/2028"}
        )

        season = Season.objects.get(name="2027/2028")
        assert season.slug == "20272028"
        assert response.status_code == 302
        assert response.url == reverse(LEAGUE_SEASON_LEAGUE_SETUP, args=[season.pk])

    def test_slug_collision_is_a_form_error_not_a_server_error(self):
        SeasonFactory(name="2025/2026")
        count_before = Season.objects.count()

        response = self.client.post(
            reverse(LEAGUE_SEASON_CREATE), data={"name": "20252026"}
        )

        assert response.status_code == 200
        assert "20252026" in response.content.decode()
        assert "2025/2026" in response.content.decode()
        assert Season.objects.count() == count_before

    def test_blank_name_is_rejected(self):
        response = self.client.post(reverse(LEAGUE_SEASON_CREATE), data={"name": "  "})

        assert response.status_code == 200
        assert not Season.objects.filter(name="").exists()


class TestSeasonUpdateView(SeasonViewTestBase):
    def setUp(self):
        super().setUp()
        self.client.force_login(self.staff)

    def test_renames_the_season_and_keeps_the_slug(self):
        response = self.client.post(
            reverse(LEAGUE_SEASON_UPDATE, args=[self.season.pk]),
            data={"name": "Saison 2026/2027"},
        )

        self.season.refresh_from_db()
        assert response.status_code == 302
        assert self.season.name == "Saison 2026/2027"
        assert self.season.slug == "20262027"


class TestSeasonLeagueTeamSetupView(SeasonViewTestBase):
    def setUp(self):
        super().setUp()
        self.client.force_login(self.staff)

    def test_shows_leagues_with_their_current_assignment(self):
        dragons = TeamFactory(name="dragons", description="Zenith Dragons")
        SeasonLeagueTeamFactory(season=self.season, league=self.league, teams=[dragons])

        response = self.client.get(
            reverse(LEAGUE_SEASON_LEAGUE_SETUP, args=[self.season.pk])
        )

        assert response.status_code == 200
        assert "gamedays/season/league_setup.html" in [
            t.name for t in response.templates
        ]
        content = response.content.decode()
        assert "Premier Division" in content
        assert "Zenith Dragons" in content
        assert self.season.name in content

    def test_offers_the_previous_season_as_copy_source(self):
        previous = SeasonFactory(name="2025/2026")
        LeagueFactory(name="League One")
        self.client.force_login(self.staff)

        response = self.client.get(
            reverse(LEAGUE_SEASON_LEAGUE_SETUP, args=[self.season.pk])
        )

        assert response.context["previous_season"] == previous
        assert previous in list(response.context["source_seasons"])

    def test_links_onward_to_gameday_creation_and_the_designer(self):
        response = self.client.get(
            reverse(LEAGUE_SEASON_LEAGUE_SETUP, args=[self.season.pk])
        )

        content = response.content.decode()
        assert reverse(LEAGUE_GAMEDAY_CREATE) in content
        # The designer creates the gameday for the season it was opened for.
        assert f"{reverse(DESIGNER_INDEX)}?season={self.season.pk}" in content

    def test_copy_from_previous_season_is_the_primary_action(self):
        response = self.client.get(
            reverse(LEAGUE_SEASON_LEAGUE_SETUP, args=[self.season.pk])
        )

        content = response.content.decode()
        assert reverse(LEAGUE_SEASON_LEAGUE_COPY, args=[self.season.pk]) in content
        # Primary placement: the copy action is offered before manual assignment.
        assert content.index("Aus Vorsaison übernehmen") < content.index(
            "Manuell zuordnen"
        )

    def test_query_count_does_not_grow_with_the_number_of_leagues(self):
        SeasonLeagueTeamFactory(
            season=self.season,
            league=self.league,
            teams=[TeamFactory(name="dragons", description="Zenith Dragons")],
        )
        url = reverse(LEAGUE_SEASON_LEAGUE_SETUP, args=[self.season.pk])
        self.client.get(url)  # warm middleware/menu caches

        with CaptureQueriesContext(connection) as small:
            self.client.get(url)

        for index in range(10):
            SeasonLeagueTeamFactory(
                season=self.season,
                league=LeagueFactory(name=f"weitere-liga-{index:02d}"),
                teams=[TeamFactory(name=f"weitere-mannschaft-{index:02d}")],
            )

        with CaptureQueriesContext(connection) as large:
            self.client.get(url)

        assert len(large) == len(small)


class TestSeasonLeagueTeamAssignView(SeasonViewTestBase):
    def setUp(self):
        super().setUp()
        self.client.force_login(self.staff)
        self.dragons = TeamFactory(name="dragons", description="Zenith Dragons")
        self.wolves = TeamFactory(name="wolves", description="Quantum Wolves")

    def _post(self, teams):
        return self.client.post(
            reverse(LEAGUE_SEASON_LEAGUE_ASSIGN, args=[self.season.pk, self.league.pk]),
            data={"teams": [team.pk for team in teams]},
        )

    def test_assigns_teams_to_a_league(self):
        response = self._post([self.dragons, self.wolves])

        assignment = SeasonLeagueTeam.objects.get(
            season=self.season, league=self.league
        )
        assert set(assignment.teams.all()) == {self.dragons, self.wolves}
        assert response.status_code == 302
        assert response.url == reverse(
            LEAGUE_SEASON_LEAGUE_SETUP, args=[self.season.pk]
        )

    def test_second_assignment_updates_instead_of_creating_a_duplicate(self):
        self._post([self.dragons])

        self._post([self.wolves])

        rows = SeasonLeagueTeam.objects.filter(season=self.season, league=self.league)
        assert rows.count() == 1
        assert set(rows.first().teams.all()) == {self.wolves}

    def test_assigns_an_empty_team_list(self):
        SeasonLeagueTeamFactory(
            season=self.season, league=self.league, teams=[self.dragons]
        )

        self._post([])

        assignment = SeasonLeagueTeam.objects.get(
            season=self.season, league=self.league
        )
        assert assignment.teams.count() == 0


class TestSeasonLeagueTeamCopyView(SeasonViewTestBase):
    def setUp(self):
        super().setUp()
        self.client.force_login(self.staff)
        self.previous = SeasonFactory(name="2025/2026")
        self.league_b = LeagueFactory(name="League One")
        self.teams_a = [TeamFactory(name="dragons", description="Zenith Dragons")]
        self.teams_b = [TeamFactory(name="wolves", description="Quantum Wolves")]
        SeasonLeagueTeamFactory(
            season=self.previous, league=self.league, teams=self.teams_a
        )
        SeasonLeagueTeamFactory(
            season=self.previous, league=self.league_b, teams=self.teams_b
        )

    def _post(self, **extra):
        return self.client.post(
            reverse(LEAGUE_SEASON_LEAGUE_COPY, args=[self.season.pk]),
            data=extra,
            follow=True,
        )

    def test_copies_the_previous_season_by_default(self):
        response = self._post()

        assert SeasonLeagueTeam.objects.filter(season=self.season).count() == 2
        assert (
            "2 Zuordnung(en) übernommen, 0 übersprungen." in response.content.decode()
        )
        copied = SeasonLeagueTeam.objects.get(season=self.season, league=self.league)
        assert set(copied.teams.all()) == set(self.teams_a)

    def test_copying_twice_is_idempotent(self):
        self._post()

        response = self._post()

        assert SeasonLeagueTeam.objects.filter(season=self.season).count() == 2
        assert (
            "0 Zuordnung(en) übernommen, 2 übersprungen." in response.content.decode()
        )

    def test_reports_already_configured_leagues_as_skipped(self):
        SeasonLeagueTeamFactory(
            season=self.season, league=self.league, teams=self.teams_b
        )

        response = self._post()

        assert (
            "1 Zuordnung(en) übernommen, 1 übersprungen." in response.content.decode()
        )

    def test_accepts_an_explicit_source_season(self):
        old = SeasonFactory(name="2024/2025")
        SeasonLeagueTeamFactory(season=old, league=self.league_b, teams=self.teams_a)

        self._post(from_season=old.pk)

        assert SeasonLeagueTeam.objects.filter(season=self.season).count() == 1
        assert SeasonLeagueTeam.objects.filter(
            season=self.season, league=self.league_b
        ).exists()

    def test_without_a_previous_season_nothing_is_copied(self):
        oldest = SeasonFactory(name="2000/2001")

        response = self.client.post(
            reverse(LEAGUE_SEASON_LEAGUE_COPY, args=[oldest.pk]), follow=True
        )

        assert "Keine Vorsaison gefunden" in response.content.decode()
        assert SeasonLeagueTeam.objects.filter(season=oldest).count() == 0
