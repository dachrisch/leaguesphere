from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APITestCase
from knox.models import AuthToken
from .models import Journey, JourneyEvent

class JourneyModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='pass')

    def test_create_journey(self):
        journey = Journey.objects.create(user=self.user)
        self.assertEqual(journey.user, self.user)
        self.assertIsNone(journey.ended_at)

    def test_journey_event_creation(self):
        journey = Journey.objects.create(user=self.user)
        event = JourneyEvent.objects.create(
            journey=journey,
            event_name='test_event',
            metadata={'key': 'value'}
        )
        self.assertEqual(event.journey, journey)
        self.assertEqual(event.event_name, 'test_event')
        self.assertIn(event, journey.events.all())

class JourneyAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='pass')
        self.token = AuthToken.objects.create(self.user)[1]

    def test_create_event(self):
        journey = Journey.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        response = self.client.post('/api/journey/events/', {
            'event_name': 'test_action',
            'metadata': {'test': True}
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(JourneyEvent.objects.count(), 1)

    def test_get_stats(self):
        journey = Journey.objects.create(user=self.user)
        JourneyEvent.objects.create(journey=journey, event_name='event1')
        JourneyEvent.objects.create(journey=journey, event_name='event1')
        JourneyEvent.objects.create(journey=journey, event_name='event2')

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
        response = self.client.get('/api/journey/events/stats/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['total_events'], 3)

    def test_inactivity_boundary(self):
        """Test that a new journey is created after inactivity."""
        from django.test import override_settings
        from django.db import connection
        from django.db.models import F

        with override_settings(JOURNEY_INACTIVITY_MINUTES=1):
            # Create first journey and old event
            journey1 = Journey.objects.create(user=self.user)
            event1 = JourneyEvent.objects.create(
                journey=journey1,
                event_name='event1'
            )

            # Manually update the event's created_at to 2 minutes ago
            # We bypass auto_now_add by using raw SQL
            old_time = timezone.now() - timedelta(minutes=2)
            JourneyEvent.objects.filter(id=event1.id).update(created_at=old_time)

            # Verify the old event is there with past timestamp
            self.assertEqual(Journey.objects.filter(user=self.user).count(), 1)
            self.assertEqual(JourneyEvent.objects.count(), 1)
            event1.refresh_from_db()
            self.assertTrue(event1.created_at < timezone.now() - timedelta(minutes=1))

            # Create new event after inactivity period
            self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token}')
            response = self.client.post('/api/journey/events/', {
                'event_name': 'event2',
                'metadata': {}
            }, format='json')

            self.assertEqual(response.status_code, 201)
            # Check how many journeys and events exist now
            journeys = Journey.objects.filter(user=self.user)
            events = JourneyEvent.objects.all()
            # A new journey should have been created due to inactivity
            self.assertEqual(journeys.count(), 2, f"Expected 2 journeys, got {journeys.count()}")
            self.assertEqual(events.count(), 2, f"Expected 2 events, got {events.count()}")
            # Old journey should be marked as ended
            journey1.refresh_from_db()
            self.assertIsNotNone(journey1.ended_at, "Old journey should have ended_at set")
