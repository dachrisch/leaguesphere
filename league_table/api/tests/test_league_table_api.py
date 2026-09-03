"""
Tests for the public read-only league table JSON API.

Following TDD principles - these tests define the expected behavior
before implementation.
"""

from django.test import TestCase, Client
from django.urls import reverse

from gamedays.models import Gameday, Gameinfo, Gameresult, SeasonLeagueTeam
from gamedays.tests.setup_factories.factories import GamedayFactory, TeamFactory
from league_table.api.constants import (
    API_LEAGUE_TABLE_BY_LEAGUE,
    API_LEAGUE_TABLE_BY_SEASON,
)
from league_table.models import LeagueRulesetTieBreak
from league_table.tests.setup_factories.factories_leaguetable import (
    LeagueSeasonConfigFactory,
    TieBreakStepFactory,
)


class LeagueTableApiTestBase(TestCase):
    def setUp(self):
        self.client = Client()
        self.config = LeagueSeasonConfigFactory()
        self.season = self.season = self.config.season
        self.league = self.config.league
        # The standing aggregation resolves team membership through the
        # league-points league family; include the league itself.
        self.config.leagues_for_league_points.add(self.league)
        step = TieBreakStepFactory(key="win_quotient")
        LeagueRulesetTieBreak.objects.create(
            ruleset=self.config.ruleset, step=step, order=0
        )
        self.officials = TeamFactory(name="Ref Crew")

        self.team_a = TeamFactory(name="Titans", description="Titans")
        self.team_b = TeamFactory(name="Sharks", description="Sharks")
        membership = SeasonLeagueTeam.objects.create(season=self.season, league=self.league)
        membership.teams.add(self.team_a, self.team_b)

        self.gameday = GamedayFactory(
            season=self.season, league=self.league, status=Gameday.STATUS_PUBLISHED
        )
        self.game = Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled="10:00",
            field=1,
            officials=self.officials,
            status=Gameinfo.STATUS_COMPLETED,
            stage="Gruppe",
            standing="Gruppe 1",
        )
        Gameresult.objects.create(
            gameinfo=self.game, team=self.team_a, fh=10, sh=10, pa=0, isHome=True
        )
        Gameresult.objects.create(
            gameinfo=self.game, team=self.team_b, fh=0, sh=0, pa=20, isHome=False
        )

        self.url_season = reverse(
            API_LEAGUE_TABLE_BY_SEASON,
            kwargs={"league": self.league.slug, "season": self.season.slug},
        )
        self.url_league = reverse(
            API_LEAGUE_TABLE_BY_LEAGUE, kwargs={"league": self.league.slug}
        )

    def rows(self, response):
        return response.json()["standing"]


class TestLeagueTableApiAccess(LeagueTableApiTestBase):
    def test_standing_by_league_and_season_is_public(self):
        response = self.client.get(self.url_season)
        self.assertEqual(response.status_code, 200)

    def test_standing_by_league_uses_latest_season(self):
        response = self.client.get(self.url_league)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["season"]["slug"], self.season.slug)

    def test_unknown_league_returns_404(self):
        response = self.client.get("/api/league-table/does-not-exist/")
        self.assertEqual(response.status_code, 404)

    def test_unknown_season_returns_404(self):
        response = self.client.get(f"/api/league-table/{self.league.slug}/1999/")
        self.assertEqual(response.status_code, 404)


class TestLeagueTableApiPayload(LeagueTableApiTestBase):
    def test_content_type_is_json(self):
        response = self.client.get(self.url_season)
        self.assertIn("application/json", response["Content-Type"])

    def test_payload_contains_league_and_season(self):
        response = self.client.get(self.url_season)
        payload = response.json()
        self.assertEqual(payload["league"]["slug"], self.league.slug)
        self.assertEqual(payload["league"]["name"], self.league.name)
        self.assertEqual(payload["season"]["slug"], self.season.slug)
        self.assertEqual(payload["season"]["name"], str(self.season.name))

    def test_standing_contains_team_names(self):
        response = self.client.get(self.url_season)
        names = {row["team__description"] for row in self.rows(response)}
        self.assertEqual(names, {"Titans", "Sharks"})

    def test_standing_contains_computed_columns(self):
        response = self.client.get(self.url_season)
        row = next(
            r for r in self.rows(response) if r["team__description"] == "Titans"
        )
        self.assertEqual(row["wins"], 1)
        self.assertEqual(row["games_played"], 1)
        self.assertEqual(row["pf"], 20)

    def test_finished_games_only(self):
        scheduled_game = Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled="11:00",
            field=2,
            officials=self.officials,
            status=Gameinfo.STATUS_PUBLISHED,
            stage="Gruppe",
            standing="Gruppe 1",
        )
        Gameresult.objects.create(
            gameinfo=scheduled_game, team=self.team_a, fh=0, sh=0, pa=0, isHome=True
        )
        response = self.client.get(self.url_season)
        row = next(
            r for r in self.rows(response) if r["team__description"] == "Titans"
        )
        self.assertEqual(row["games_played"], 1)

    def test_team_without_games_is_serialized(self):
        lonely = TeamFactory(name="Lone Wolves", description="Lone Wolves")
        membership = SeasonLeagueTeam.objects.create(season=self.season, league=self.league)
        membership.teams.add(lonely)
        response = self.client.get(self.url_season)
        self.assertEqual(response.status_code, 200)
        row = next(
            r for r in self.rows(response) if r["team__description"] == "Lone Wolves"
        )
        self.assertEqual(row["games_played"], 0)
        self.assertIn("standing", row)


class TestLeagueTableApiEtag(LeagueTableApiTestBase):
    def test_response_has_etag(self):
        response = self.client.get(self.url_season)
        self.assertIn("ETag", response)

    def test_304_on_if_none_match(self):
        etag = self.client.get(self.url_season)["ETag"]
        response = self.client.get(self.url_season, HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(response.status_code, 304)

    def test_etag_changes_when_results_change(self):
        etag = self.client.get(self.url_season)["ETag"]
        result = Gameresult.objects.get(gameinfo=self.game, isHome=True)
        result.sh = 12
        result.save()
        response = self.client.get(self.url_season, HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(response.status_code, 200)
