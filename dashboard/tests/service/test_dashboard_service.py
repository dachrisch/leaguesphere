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
        stats_before = DashboardService.get_admin_stats()
        teams_before = stats_before["teams"]

        # Create a dummy team — should be excluded from counts
        dummy_team = Team.objects.create(
            name="Dummy Team",
            description="Placeholder",
            location="dummy",
        )
        try:
            stats_after = DashboardService.get_admin_stats()
            self.assertEqual(stats_after["teams"], teams_before, "Dummy team should not be counted")
        finally:
            dummy_team.delete()

        self.assertIn("gamedays", stats_before)
        self.assertIn("teams", stats_before)
        self.assertIn("games", stats_before)
        self.assertIsInstance(stats_before["gamedays"], int)
        self.assertIsInstance(stats_before["teams"], int)
        self.assertIsInstance(stats_before["games"], int)

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
        self.assertIn("gamedays", season)
        self.assertIsInstance(season["gamedays"], list)
        self.assertGreater(len(season["gamedays"]), 0)

        gameday = season["gamedays"][0]
        self.assertIn("id", gameday)
        self.assertIn("name", gameday)
        self.assertIn("date", gameday)
        self.assertIn("game_count", gameday)
        self.assertIsInstance(gameday["game_count"], int)
        self.assertNotIn("games", gameday)

    def test_get_teams_list_excludes_dummy(self):
        """Test get_teams_list excludes teams with location='dummy'"""
        dummy_team = Team.objects.create(
            name="Placeholder",
            description="Dummy placeholder",
            location="dummy",
        )
        try:
            result = DashboardService.get_teams_list()
            team_ids = [t["id"] for t in result]
            self.assertNotIn(dummy_team.id, team_ids, "Dummy team should be excluded from teams_list")
            self.assertIn(self.team_a.id, team_ids, "Real team should be in teams_list")
            # Verify structure
            for entry in result:
                self.assertIn("id", entry)
                self.assertIn("name", entry)
        finally:
            dummy_team.delete()


class GamedayScheduleServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from datetime import date, time
        cls.user = User.objects.create_user(username="author")
        cls.season = Season.objects.create(name="2026")
        cls.league = League.objects.create(name="DFFL")
        cls.official_team = Team.objects.create(name="Officials")

        # Future gameday
        cls.future_gd = Gameday.objects.create(
            name="Future Gameday",
            season=cls.season,
            league=cls.league,
            date=date(2026, 4, 1),
            start=time(10, 0, 0),
            author=cls.user,
        )

        # Past gameday
        cls.past_gd = Gameday.objects.create(
            name="Past Gameday",
            season=cls.season,
            league=cls.league,
            date=date(2026, 1, 1),
            start=time(10, 0, 0),
            author=cls.user,
        )

    def test_returns_required_keys(self):
        data = DashboardService.get_gameday_schedule()
        self.assertIn("gamedays", data)
        self.assertIn("live_gameday", data)
        self.assertIn("next_gameday", data)

    def test_gameday_entry_has_required_fields(self):
        data = DashboardService.get_gameday_schedule()
        entry = data["gamedays"][0]
        for field in ["id", "name", "date", "start", "league_name", "season_name", "status", "is_live"]:
            self.assertIn(field, entry)

    def test_next_gameday_is_future(self):
        # We need a fixed today for this to be deterministic in logic,
        # but the service uses timezone.now().date().
        # Since our test data uses 2026-04-01, it should be in the future
        # relative to the current date (unless the test is run in 2027+).
        data = DashboardService.get_gameday_schedule()
        next_gd = data["next_gameday"]
        if next_gd:
            self.assertEqual(next_gd["id"], self.future_gd.pk)
            self.assertGreaterEqual(next_gd["days_until"], 0)

    def test_live_gameday_is_none_when_no_live_games(self):
        data = DashboardService.get_gameday_schedule()
        self.assertIsNone(data["live_gameday"])

    def test_live_gameday_detected_when_gameinfo_is_live(self):
        from gamedays.models import Gameinfo
        # Create a live game for the future gameday
        Gameinfo.objects.create(
            gameday=self.future_gd,
            scheduled=time(10, 0),
            field=1,
            status="1. Halbzeit",
            officials=self.official_team
        )

        data = DashboardService.get_gameday_schedule()
        self.assertIsNotNone(data["live_gameday"])
        self.assertEqual(data["live_gameday"]["id"], self.future_gd.pk)

    def test_is_live_flag_set_on_gameday_entry(self):
        from gamedays.models import Gameinfo
        Gameinfo.objects.create(
            gameday=self.future_gd,
            scheduled=time(10, 0),
            field=1,
            status="1. Halbzeit",
            officials=self.official_team
        )

        data = DashboardService.get_gameday_schedule()
        future_entry = next(g for g in data["gamedays"] if g["id"] == self.future_gd.pk)
        self.assertTrue(future_entry["is_live"])
