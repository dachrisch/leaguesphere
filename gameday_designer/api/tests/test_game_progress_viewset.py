"""
Tests for GameProgressViewSet API Endpoint

TDD: Test the API behavior (filtering, pagination, permissions)
before implementing the viewset.
"""

from datetime import date, time, timedelta
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from gamedays.models import Gameday, Gameinfo, Season, League, Team


class GameProgressViewSetTestCase(TestCase):
    """Test GameProgressViewSet API endpoint"""

    def setUp(self):
        """Create test data and API client"""
        self.client = APIClient()
        self.user = User.objects.create_user(username='testuser', password='testpass')
        self.user.is_staff = True
        self.user.save()

        self.season = Season.objects.create(name="2026 Spring")
        self.league = League.objects.create(name="U16")

        self.officials_team = Team.objects.create(
            name="Officials",
            description="Officials team",
            location="Neutral"
        )

        # Create gamedays for testing
        today = date.today()
        self.gameday_today = Gameday.objects.create(
            name="Today's Games",
            season=self.season,
            league=self.league,
            date=today,
            start=time(10, 0),
            status=Gameday.STATUS_PUBLISHED,
            author=self.user
        )

        self.gameday_tomorrow = Gameday.objects.create(
            name="Tomorrow's Games",
            season=self.season,
            league=self.league,
            date=today + timedelta(days=1),
            start=time(14, 0),
            status=Gameday.STATUS_PUBLISHED,
            author=self.user
        )

        self.gameday_future = Gameday.objects.create(
            name="Future Games",
            season=self.season,
            league=self.league,
            date=today + timedelta(days=10),
            start=time(14, 0),
            status=Gameday.STATUS_PUBLISHED,
            author=self.user
        )

    def test_api_endpoint_exists(self):
        """RED: API endpoint at /api/gamedays/progress/ must exist"""
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/gamedays/progress/', format='json')
        # Should not be 404
        self.assertNotEqual(response.status_code, 404)

    def test_api_requires_staff_permission(self):
        """RED: API endpoint must require staff permission"""
        # Non-staff user
        user = User.objects.create_user(username='regular', password='pass')
        self.client.force_authenticate(user=user)

        response = self.client.get('/api/gamedays/progress/', format='json')
        # Should be 403 Forbidden or 401 Unauthorized
        self.assertIn(response.status_code, [401, 403])

    def test_api_returns_paginated_response(self):
        """RED: API must return paginated response with count, next, previous"""
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/gamedays/progress/', format='json')

        data = response.json()
        self.assertIn('count', data)
        self.assertIn('next', data)
        self.assertIn('previous', data)
        self.assertIn('results', data)

    def test_api_returns_gameday_list(self):
        """RED: API results must be list of gamedays"""
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/gamedays/progress/', format='json')

        data = response.json()
        self.assertGreater(data['count'], 0)
        self.assertGreater(len(data['results']), 0)

    def test_api_gameday_structure(self):
        """RED: Each gameday in response must have required fields"""
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/gamedays/progress/', format='json')

        gameday = response.json()['results'][0]

        required_fields = [
            'id', 'name', 'date', 'start', 'status',
            'league', 'league_display', 'season', 'season_display',
            'games'
        ]
        for field in required_fields:
            self.assertIn(field, gameday, f"Missing field: {field}")

    def test_api_default_date_range(self):
        """RED: API should default to past day + next 7 days"""
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/gamedays/progress/', format='json')

        data = response.json()
        # Should include today and tomorrow (within 7 days)
        gameday_names = [g['name'] for g in data['results']]
        self.assertIn("Today's Games", gameday_names)
        self.assertIn("Tomorrow's Games", gameday_names)
        # Should NOT include gameday 10 days from now (outside default range)
        self.assertNotIn("Future Games", gameday_names)

    def test_api_filter_by_date_from(self):
        """RED: API should support date_from filter"""
        self.client.force_authenticate(user=self.user)
        tomorrow = date.today() + timedelta(days=1)

        response = self.client.get(
            f'/api/gamedays/progress/?date_from={tomorrow.isoformat()}',
            format='json'
        )

        data = response.json()
        gameday_names = [g['name'] for g in data['results']]
        # Should include tomorrow but not today
        self.assertNotIn("Today's Games", gameday_names)
        self.assertIn("Tomorrow's Games", gameday_names)

    def test_api_filter_by_date_to(self):
        """RED: API should support date_to filter"""
        self.client.force_authenticate(user=self.user)
        today = date.today()

        response = self.client.get(
            f'/api/gamedays/progress/?date_to={today.isoformat()}',
            format='json'
        )

        data = response.json()
        gameday_names = [g['name'] for g in data['results']]
        # Should include today but not tomorrow
        self.assertIn("Today's Games", gameday_names)
        self.assertNotIn("Tomorrow's Games", gameday_names)

    def test_api_filter_by_league(self):
        """RED: API should support league filter"""
        # Create another league
        league2 = League.objects.create(name="U14")
        gameday_other = Gameday.objects.create(
            name="Other League Games",
            season=self.season,
            league=league2,
            date=date.today(),
            start=time(10, 0),
            status=Gameday.STATUS_PUBLISHED,
            author=self.user
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.get(
            f'/api/gamedays/progress/?league={self.league.id}',
            format='json'
        )

        data = response.json()
        gameday_names = [g['name'] for g in data['results']]
        self.assertIn("Today's Games", gameday_names)
        self.assertNotIn("Other League Games", gameday_names)
