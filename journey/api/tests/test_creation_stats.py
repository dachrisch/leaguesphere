from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from gamedays.models import Gameday, GamedayDesignerState, League, Season

User = get_user_model()


class GameCreationStatsServiceTests(TestCase):
    """Unit tests for GameCreationStatsService calculation logic."""

    def setUp(self):
        """Create test data with known designer/legacy split."""
        self.season = Season.objects.create(name='Test Season 2026')
        self.league1 = League.objects.create(name='FF BL', slug='ff-bl')
        self.league2 = League.objects.create(name='Bayern U16', slug='bayern-u16')
        self.user = User.objects.create_user(username='testuser', password='pass123')

        today = timezone.now().date()

        # Create 30-day window test data
        # League 1: 2 designer, 0 legacy
        for i in range(2):
            gameday = Gameday.objects.create(
                name=f'FF BL Game {i}',
                season=self.season,
                league=self.league1,
                date=today - timedelta(days=5),
                start='18:00',
                author=self.user
            )
            GamedayDesignerState.objects.create(gameday=gameday, state_data={})

        # League 2: 0 designer, 5 legacy
        for i in range(5):
            Gameday.objects.create(
                name=f'Bayern Game {i}',
                season=self.season,
                league=self.league2,
                date=today - timedelta(days=10),
                start='18:00',
                author=self.user
            )

    def test_summary_stats_30_days(self):
        """Test summary calculation for 30-day window."""
        from journey.api.creation_stats import GameCreationStatsService

        stats = GameCreationStatsService.get_stats(days_list=[30])
        result_dict = stats.to_dict()

        self.assertEqual(result_dict['summary']['30']['designer'], 2)
        self.assertEqual(result_dict['summary']['30']['legacy'], 5)
        self.assertEqual(result_dict['summary']['30']['total'], 7)
        self.assertAlmostEqual(result_dict['summary']['30']['designer_percentage'], 28.6, places=1)

    def test_per_league_stats_30_days(self):
        """Test per-league breakdown for 30-day window."""
        from journey.api.creation_stats import GameCreationStatsService

        stats = GameCreationStatsService.get_stats(days_list=[30])
        result_dict = stats.to_dict()
        leagues = result_dict['by_league']['30']

        # Should have 2 leagues
        self.assertEqual(len(leagues), 2)

        # First league (sorted by adoption %) should be FF BL with 100%
        self.assertEqual(leagues[0]['league_name'], 'FF BL')
        self.assertEqual(leagues[0]['designer'], 2)
        self.assertEqual(leagues[0]['legacy'], 0)
        self.assertEqual(leagues[0]['designer_percentage'], 100.0)

        # Second league should be Bayern U16 with 0%
        self.assertEqual(leagues[1]['league_name'], 'Bayern U16')
        self.assertEqual(leagues[1]['designer'], 0)
        self.assertEqual(leagues[1]['legacy'], 5)
        self.assertEqual(leagues[1]['designer_percentage'], 0.0)

    def test_stats_empty_window(self):
        """Test stats when no games in time window."""
        from journey.api.creation_stats import GameCreationStatsService

        stats = GameCreationStatsService.get_stats(days_list=[1])  # Only last 1 day
        result_dict = stats.to_dict()

        self.assertEqual(result_dict['summary']['1']['total'], 0)
        self.assertEqual(result_dict['summary']['1']['designer_percentage'], 0.0)

    def test_multiple_time_windows(self):
        """Test stats for multiple time windows simultaneously."""
        from journey.api.creation_stats import GameCreationStatsService

        stats = GameCreationStatsService.get_stats(days_list=[7, 30])
        result_dict = stats.to_dict()

        # Should have both time windows
        self.assertIn('7', result_dict['summary'])
        self.assertIn('30', result_dict['summary'])
        self.assertIn('7', result_dict['by_league'])
        self.assertIn('30', result_dict['by_league'])


class GameCreationStatsAPITests(APITestCase):
    """Integration tests for the API endpoint."""

    def setUp(self):
        """Create test data and authenticated client."""
        self.user = User.objects.create_user(username='testuser', password='pass123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.season = Season.objects.create(name='Test Season 2026')
        self.league = League.objects.create(name='FF BL', slug='ff-bl')

        today = timezone.now().date()
        gameday = Gameday.objects.create(
            name='FF BL Test',
            season=self.season,
            league=self.league,
            date=today - timedelta(days=5),
            start='18:00',
            author=self.user
        )
        GamedayDesignerState.objects.create(gameday=gameday, state_data={})

    def test_api_endpoint_exists(self):
        """Test that the endpoint is accessible."""
        response = self.client.get('/api/journey/gameday-creation-stats/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_api_response_format(self):
        """Test that response matches expected schema."""
        response = self.client.get('/api/journey/gameday-creation-stats/')
        data = response.json()

        self.assertIn('summary', data)
        self.assertIn('by_league', data)
        self.assertIn('30', data['summary'])
        self.assertIn('30', data['by_league'])

    def test_api_requires_authentication(self):
        """Test that endpoint requires authentication."""
        client = APIClient()
        response = client.get('/api/journey/gameday-creation-stats/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_api_etag_caching(self):
        """Test that ETag header is present for cache support."""
        response = self.client.get('/api/journey/gameday-creation-stats/')
        self.assertIn('ETag', response)

    def test_api_custom_days_parameter(self):
        """Test custom days parameter."""
        response = self.client.get('/api/journey/gameday-creation-stats/?days=7,90')
        data = response.json()

        self.assertIn('7', data['summary'])
        self.assertIn('90', data['summary'])
        self.assertNotIn('30', data['summary'])

    def test_api_invalid_days_parameter(self):
        """Test invalid days parameter returns 400."""
        response = self.client.get('/api/journey/gameday-creation-stats/?days=invalid')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
