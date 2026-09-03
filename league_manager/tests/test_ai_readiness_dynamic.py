"""
Tests for dynamic-context AI files (/llms-dynamic.txt, /facts.json),
JSON-LD structured data and API throttling configuration.

Following TDD principles - these tests define the expected behavior
before implementation.
"""

import json

from django.test import TestCase, Client
from django.test.client import RequestFactory
from django.urls import reverse

from gamedays.models import Gameday, Gameinfo, Gameresult, SeasonLeagueTeam
from gamedays.tests.setup_factories.factories import GamedayFactory, TeamFactory
from league_table.api.constants import API_LEAGUE_TABLE_BY_LEAGUE
from league_table.models import LeagueRulesetTieBreak
from league_table.tests.setup_factories.factories_leaguetable import (
    LeagueSeasonConfigFactory,
    TieBreakStepFactory,
)


class TestLlmsDynamicTxtEndpoint(TestCase):
    def setUp(self):
        self.client = Client()

    def test_llms_dynamic_txt_is_accessible(self):
        response = self.client.get("/llms-dynamic.txt")
        self.assertEqual(response.status_code, 200)

    def test_llms_dynamic_txt_returns_text_content_type(self):
        response = self.client.get("/llms-dynamic.txt")
        self.assertEqual(response["Content-Type"], "text/plain")

    def test_llms_dynamic_txt_documents_liveticker_api(self):
        response = self.client.get("/llms-dynamic.txt")
        self.assertContains(response, "/api/liveticker/")

    def test_llms_dynamic_txt_documents_league_table_api(self):
        response = self.client.get("/llms-dynamic.txt")
        self.assertContains(response, "/api/league-table/")

    def test_llms_dynamic_txt_documents_gameday_games_api(self):
        response = self.client.get("/llms-dynamic.txt")
        self.assertContains(response, "/games/")

    def test_llms_dynamic_txt_explains_game_status_vocabulary(self):
        response = self.client.get("/llms-dynamic.txt")
        self.assertContains(response, "beendet")

    def test_llms_dynamic_txt_explains_freshness(self):
        response = self.client.get("/llms-dynamic.txt")
        self.assertContains(response, "Cache-Control")


class TestFactsJsonEndpoint(TestCase):
    def setUp(self):
        self.client = Client()

    def test_facts_json_is_accessible(self):
        response = self.client.get("/facts.json")
        self.assertEqual(response.status_code, 200)

    def test_facts_json_returns_json_content_type(self):
        response = self.client.get("/facts.json")
        self.assertIn("application/json", response["Content-Type"])

    def test_facts_json_contains_brand_facts(self):
        payload = json.loads(self.client.get("/facts.json").content)
        self.assertEqual(payload["name"], "LeagueSphere")
        self.assertIn("description", payload)
        self.assertIn("sport", payload)

    def test_facts_json_lists_dynamic_endpoints_with_freshness(self):
        payload = json.loads(self.client.get("/facts.json").content)
        endpoints = payload["dynamicEndpoints"]
        by_url = {e["url"]: e for e in endpoints}
        self.assertIn("/api/liveticker/", by_url)
        self.assertIn("updateFrequency", by_url["/api/liveticker/"])

    def test_facts_json_references_agent_documentation(self):
        payload = json.loads(self.client.get("/facts.json").content)
        self.assertIn("/llms.txt", payload["agentDocumentation"])
        self.assertIn("/llms-dynamic.txt", payload["agentDocumentation"])

    def test_facts_json_documentation_matches_shared_constants(self):
        """The advertised docs are the STATIC_INFO_PATHS subset for agents."""
        from league_manager.constants import STATIC_INFO_PATHS

        payload = json.loads(self.client.get("/facts.json").content)
        self.assertEqual(
            payload["agentDocumentation"],
            [
                STATIC_INFO_PATHS["llms"],
                STATIC_INFO_PATHS["llms-full"],
                STATIC_INFO_PATHS["llms-dynamic"],
                STATIC_INFO_PATHS["agents"],
                STATIC_INFO_PATHS["security"],
            ],
        )

    def test_facts_json_and_dynamic_txt_are_guaranteed_exempt(self):
        """Both files are served without a database (STATIC_INFO_PATHS loop)."""
        from league_manager.middleware.db_guard import DatabaseGuardMiddleware
        from league_manager.middleware.maintenance import MaintenanceModeMiddleware

        for path in ("/facts.json", "/llms-dynamic.txt"):
            self.assertTrue(MaintenanceModeMiddleware._is_exempt(path))
            request = RequestFactory().get(path)
            DatabaseGuardMiddleware(lambda r: "ok")(request)
            self.assertEqual(getattr(request, "db_online", "skipped"), "skipped")


class TestLlmsTxtReferencesDynamicLayer(TestCase):
    def setUp(self):
        self.client = Client()

    def test_llms_txt_links_dynamic_reference(self):
        response = self.client.get("/llms.txt")
        self.assertContains(response, "/llms-dynamic.txt")

    def test_llms_txt_links_league_table_api(self):
        response = self.client.get("/llms.txt")
        self.assertContains(response, "/api/league-table/")


class TestGameDetailJsonLd(TestCase):
    def setUp(self):
        self.client = Client()
        self.officials = TeamFactory(name="Ref Crew")
        self.home = TeamFactory(name="Home Team", description="Home Team")
        self.away = TeamFactory(name="Away Team", description="Away Team")
        self.gameday = GamedayFactory(status="PUBLISHED")
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
            gameinfo=self.game, team=self.home, fh=10, sh=14, pa=6, isHome=True
        )
        Gameresult.objects.create(
            gameinfo=self.game, team=self.away, fh=6, sh=0, pa=24, isHome=False
        )
        # A result row without a team (legacy data) must be skipped by the
        # JSON-LD builder, not crash or leak a null team into the payload.
        Gameresult.objects.create(
            gameinfo=self.game, team=None, fh=0, sh=0, pa=0, isHome=True
        )
        self.url = reverse("league-gameday-game-detail", kwargs={"gameday_pk": self.gameday.pk, "pk": self.game.pk})

    def test_game_detail_contains_sports_event_json_ld(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "application/ld+json")
        self.assertContains(response, "SportsEvent")

    def test_json_ld_contains_teams_and_final_score(self):
        response = self.client.get(self.url)
        content = response.content.decode()
        ld_block = content.split('type="application/ld+json">')[1].split("</script>")[0]
        payload = json.loads(ld_block)
        self.assertEqual(payload["@type"], "SportsEvent")
        self.assertEqual(payload["homeTeam"]["name"], "Home Team")
        self.assertEqual(payload["awayTeam"]["name"], "Away Team")
        self.assertEqual(payload["homeTeam"]["score"], 24)
        self.assertEqual(payload["awayTeam"]["score"], 6)
        self.assertEqual(payload["eventStatus"], "https://schema.org/EventPassed")
        # the anonymous result row must not appear as a team
        self.assertEqual(set(payload.keys()) & {"homeTeam", "awayTeam"},
                         {"homeTeam", "awayTeam"})

    def test_json_ld_contains_speakable(self):
        response = self.client.get(self.url)
        self.assertContains(response, "SpeakableSpecification")


class TestLeagueTableJsonLd(TestCase):
    def setUp(self):
        self.client = Client()
        self.config = LeagueSeasonConfigFactory()
        self.config.leagues_for_league_points.add(self.config.league)
        # Production rulesets always define tie-break steps; without one the
        # ranking engine crashes on empty tie-break columns.
        LeagueRulesetTieBreak.objects.create(
            ruleset=self.config.ruleset,
            step=TieBreakStepFactory(key="win_quotient"),
            order=0,
        )
        home = TeamFactory(name="Home Team", description="Home Team")
        away = TeamFactory(name="Away Team", description="Away Team")
        officials = TeamFactory(name="Ref Crew")
        membership = SeasonLeagueTeam.objects.create(
            season=self.config.season, league=self.config.league
        )
        membership.teams.add(home, away)
        # A finished game so the standing has computed rows to serialize.
        gameday = GamedayFactory(
            season=self.config.season,
            league=self.config.league,
            status=Gameday.STATUS_PUBLISHED,
        )
        game = Gameinfo.objects.create(
            gameday=gameday,
            scheduled="10:00",
            field=1,
            officials=officials,
            status=Gameinfo.STATUS_COMPLETED,
            stage="Gruppe",
            standing="Gruppe 1",
        )
        Gameresult.objects.create(
            gameinfo=game, team=home, fh=10, sh=10, pa=0, isHome=True
        )
        Gameresult.objects.create(
            gameinfo=game, team=away, fh=0, sh=0, pa=20, isHome=False
        )
        self.url = reverse(
            API_LEAGUE_TABLE_BY_LEAGUE, kwargs={"league": self.config.league.slug}
        )
        # the HTML league table route
        self.html_url = f"/leaguetable/{self.config.league.slug}/"

    def test_league_table_contains_sports_organization_json_ld(self):
        response = self.client.get(self.html_url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "application/ld+json")
        self.assertContains(response, "SportsOrganization")
        self.assertContains(response, "SportsTeam")


class TestApiThrottleConfiguration(TestCase):
    def test_anonymous_throttle_is_configured(self):
        from django.conf import settings

        rest_settings = settings.REST_FRAMEWORK
        self.assertIn(
            "rest_framework.throttling.AnonRateThrottle",
            rest_settings["DEFAULT_THROTTLE_CLASSES"],
        )
        self.assertIn("anon", rest_settings["DEFAULT_THROTTLE_RATES"])
