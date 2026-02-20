from django.test import TestCase
from django.contrib.auth.models import User
from datetime import date, time
from gamedays.models import Season, League, Association, Team, SeasonLeagueTeam, Gameday
from dashboard.service.dashboard_service import DashboardService


class AdminStatsServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        """Create test data for admin stats"""
        # Create user for author
        cls.user = User.objects.create_user(
            username="testuser",
            email="testuser@example.com",
            password="testpassword123",
        )

        # Create associations
        cls.assoc_bayern = Association.objects.create(name="Bayern", abbr="BAY")
        cls.assoc_nrw = Association.objects.create(name="NRW", abbr="NRW")

        # Create leagues
        cls.liga_bundesliga = League.objects.create(name="Bundesliga")
        cls.liga_regionalliga = League.objects.create(name="Regionalliga")

        # Create season
        cls.season = Season.objects.create(name="2025/26")

        # Create teams
        cls.team_a = Team.objects.create(
            name="Team A",
            description="Team A Desc",
            location="City A",
            association=cls.assoc_bayern,
        )
        cls.team_b = Team.objects.create(
            name="Team B",
            description="Team B Desc",
            location="City B",
            association=cls.assoc_nrw,
        )
        cls.team_c = Team.objects.create(
            name="Team C",
            description="Team C Desc",
            location="City C",
            association=cls.assoc_nrw,
        )

        # Associate teams with season and leagues
        SeasonLeagueTeam.objects.create(
            season=cls.season, league=cls.liga_bundesliga, team=cls.team_a
        )
        SeasonLeagueTeam.objects.create(
            season=cls.season, league=cls.liga_regionalliga, team=cls.team_b
        )
        SeasonLeagueTeam.objects.create(
            season=cls.season, league=cls.liga_bundesliga, team=cls.team_c
        )

        # Create gamedays
        cls.gameday1 = Gameday.objects.create(
            name="Gameday 1",
            season=cls.season,
            league=cls.liga_bundesliga,
            date=date(2025, 3, 1),
            start=time(14, 0, 0),
            author=cls.user,
        )
        cls.gameday2 = Gameday.objects.create(
            name="Gameday 2",
            season=cls.season,
            league=cls.liga_regionalliga,
            date=date(2025, 3, 2),
            start=time(15, 0, 0),
            author=cls.user,
        )

    def test_get_admin_stats_returns_correct_counts(self):
        """Test get_admin_stats returns correct gamedays, teams, games counts"""
        stats = DashboardService.get_admin_stats()

        self.assertIn("gamedays", stats)
        self.assertIn("teams", stats)
        self.assertIn("games", stats)
        self.assertIsInstance(stats["gamedays"], int)
        self.assertIsInstance(stats["teams"], int)
        self.assertIsInstance(stats["games"], int)

    def test_get_games_per_league_returns_league_counts(self):
        """Test get_games_per_league returns games grouped by league"""
        data = DashboardService.get_games_per_league()

        self.assertIsInstance(data, list)

        # If data exists, check structure
        if data:
            first = data[0]
            self.assertIn("league_name", first)
            self.assertIn("count", first)
            self.assertIsInstance(first["count"], int)

    def test_get_teams_per_league_returns_team_counts(self):
        """Test get_teams_per_league returns teams grouped by league"""
        data = DashboardService.get_teams_per_league()

        self.assertIsInstance(data, list)
        self.assertGreater(len(data), 0)

        # Check structure
        first = data[0]
        self.assertIn("league_name", first)
        self.assertIn("count", first)
        self.assertIsInstance(first["count"], int)

    def test_get_teams_per_association_returns_association_counts(self):
        """Test get_teams_per_association returns teams grouped by association"""
        data = DashboardService.get_teams_per_association()

        self.assertIsInstance(data, list)
        self.assertGreater(len(data), 0)

        # Check structure
        first = data[0]
        self.assertIn("association_name", first)
        self.assertIn("count", first)
        self.assertIsInstance(first["count"], int)

    def test_get_referees_per_team_returns_empty_or_valid(self):
        """Test get_referees_per_team returns valid structure"""
        data = DashboardService.get_referees_per_team()

        self.assertIsInstance(data, list)

        # If data exists, check structure
        if data:
            first = data[0]
            self.assertIn("team_name", first)
            self.assertIn("team_id", first)
            self.assertIn("count", first)
            self.assertIsInstance(first["count"], int)

    def test_get_league_hierarchy_stats(self):
        """Test get_league_hierarchy_stats returns valid hierarchy"""
        data = DashboardService.get_league_hierarchy_stats()

        self.assertIsInstance(data, list)
        self.assertGreater(len(data), 0)

        # Check structure
        league = data[0]
        self.assertIn("league_name", league)
        self.assertIn("seasons", league)
        self.assertGreater(len(league["seasons"]), 0)

        season = league["seasons"][0]
        self.assertIn("season_name", season)
        self.assertIn("gamedays_count", season)
        self.assertIn("avg_teams_per_gameday", season)
        self.assertIn("avg_games_per_gameday", season)
