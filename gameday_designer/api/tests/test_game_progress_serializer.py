"""
Tests for GameProgressSerializer

TDD: Write failing tests first, then implement serializer.
These tests verify that the serializer properly denormalizes
Gameday + Gameinfo + Gameresult into flat structure for the
game progress dashboard.
"""

from datetime import datetime, timedelta, time
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth.models import User
from gamedays.models import Gameday, Gameinfo, Gameresult, Season, League, Team
from gameday_designer.api.serializers import GameProgressSerializer


class GameProgressSerializerTestCase(TestCase):
    """Test GameProgressSerializer denormalization"""

    def setUp(self):
        """Create test data: season, league, teams, gameday with games"""
        self.user = User.objects.create_user(username='testuser', password='testpass')
        self.season = Season.objects.create(name="2026 Spring")
        self.league = League.objects.create(name="U16")

        self.home_team = Team.objects.create(
            name="Düsseldorf Firecats",
            description="Test team 1",
            location="Düsseldorf"
        )
        self.away_team = Team.objects.create(
            name="Cleve Conquerors",
            description="Test team 2",
            location="Cleve"
        )
        self.officials_team = Team.objects.create(
            name="Officials",
            description="Officials team",
            location="Neutral"
        )

        # Create gameday (scheduled for today)
        today = timezone.now().date()
        self.gameday = Gameday.objects.create(
            name="Test Gameday",
            season=self.season,
            league=self.league,
            date=today,
            start=time(10, 0),
            format="6_2",
            status=Gameday.STATUS_PUBLISHED,
            address="123 Main St",
            author=self.user
        )

        # Create 3 games in this gameday
        self.game1 = Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled=time(10, 0),
            field=1,
            officials=self.officials_team,
            status="Geplant",  # Planned
            stage="Group A",
            standing="1"
        )

        self.game2 = Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled=time(11, 0),
            field=2,
            officials=self.officials_team,
            status="Gestartet",  # Started/In Progress
            gameStarted=time(11, 0),
            stage="Group A",
            standing="2"
        )

        self.game3 = Gameinfo.objects.create(
            gameday=self.gameday,
            scheduled=time(12, 0),
            field=1,
            officials=self.officials_team,
            status="beendet",  # Finished
            gameStarted=time(12, 0),
            gameFinished=time(13, 0),
            stage="Group A",
            standing="3"
        )

    def test_serializer_includes_gameday_fields(self):
        """RED: Serializer must include gameday metadata"""
        serializer = GameProgressSerializer(self.gameday)
        data = serializer.data

        # Verify all required gameday fields present
        self.assertEqual(data['id'], self.gameday.id)
        self.assertEqual(data['name'], "Test Gameday")
        self.assertEqual(data['status'], "PUBLISHED")
        self.assertEqual(data['league'], self.league.id)
        self.assertEqual(data['season'], self.season.id)

    def test_serializer_denormalizes_games(self):
        """RED: Serializer must denormalize gameinfos into games array"""
        serializer = GameProgressSerializer(self.gameday)
        data = serializer.data

        # Verify games array exists and has correct count
        self.assertIn('games', data)
        self.assertEqual(len(data['games']), 3)

    def test_serializer_game_structure(self):
        """RED: Each game in games array must have required fields"""
        serializer = GameProgressSerializer(self.gameday)
        data = serializer.data

        game = data['games'][0]

        # Required game fields
        required_fields = [
            'id', 'scheduled', 'status', 'gameStarted',
            'gameFinished', 'field', 'stage', 'standing'
        ]
        for field in required_fields:
            self.assertIn(field, game, f"Missing field: {field}")

    def test_serializer_game_status_values(self):
        """RED: Games must have correct status values"""
        serializer = GameProgressSerializer(self.gameday)
        data = serializer.data

        games = data['games']
        statuses = [g['status'] for g in games]

        # Should have mix of statuses
        self.assertIn("Geplant", statuses)      # Planned
        self.assertIn("Gestartet", statuses)    # Started
        self.assertIn("beendet", statuses)      # Finished

    def test_serializer_includes_league_display(self):
        """RED: Serializer must include league display name"""
        serializer = GameProgressSerializer(self.gameday)
        data = serializer.data

        self.assertIn('league_display', data)
        self.assertEqual(data['league_display'], "U16")

    def test_serializer_includes_season_display(self):
        """RED: Serializer must include season display name"""
        serializer = GameProgressSerializer(self.gameday)
        data = serializer.data

        self.assertIn('season_display', data)
        self.assertEqual(data['season_display'], "2026 Spring")

    def test_serializer_multiple_gamedays(self):
        """RED: Serializer should work with multiple gamedays"""
        # Create second gameday
        tomorrow = timezone.now().date() + timedelta(days=1)
        gameday2 = Gameday.objects.create(
            name="Test Gameday 2",
            season=self.season,
            league=self.league,
            date=tomorrow,
            start=time(14, 0),
            format="6_2",
            status=Gameday.STATUS_PUBLISHED,
            author=self.user
        )

        # Serialize both
        serializer = GameProgressSerializer([self.gameday, gameday2], many=True)
        data = serializer.data

        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]['name'], "Test Gameday")
        self.assertEqual(data[1]['name'], "Test Gameday 2")
