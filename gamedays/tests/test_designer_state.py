from django.test import TestCase
from django.contrib.auth.models import User
from django.db import IntegrityError
from gamedays.models import Gameday, GamedayDesignerState, Season, League
from gamedays.service.gameday_service import GamedayService


class GamedayDesignerStateModelTests(TestCase):
    def setUp(self):
        # Create required foreign key objects
        season = Season.objects.create(name="2026")
        league = League.objects.create(name="Test League")

        # Create default author user (ID 1 is required by Gameday default)
        author = User.objects.create_user(username="author", id=1)

        self.gameday = Gameday.objects.create(
            name="Test Gameday",
            date="2026-03-01",
            season=season,
            league=league,
            start="10:00:00",
            author=author,
        )
        self.user = User.objects.create_user(username="testuser")

    def test_create_designer_state(self):
        """Test creating a designer state for a gameday."""
        state_data = {
            "nodes": [{"id": "1", "type": "game"}],
            "edges": [],
            "globalTeams": [],
        }

        designer_state = GamedayDesignerState.objects.create(
            gameday=self.gameday, state_data=state_data, last_modified_by=self.user
        )

        self.assertEqual(designer_state.gameday, self.gameday)
        self.assertEqual(designer_state.state_data, state_data)
        self.assertEqual(designer_state.last_modified_by, self.user)
        self.assertIsNotNone(designer_state.created_at)
        self.assertIsNotNone(designer_state.updated_at)

    def test_one_to_one_relationship(self):
        """Test that gameday has one-to-one relationship with designer state."""
        state_data = {"nodes": [], "edges": [], "globalTeams": []}

        GamedayDesignerState.objects.create(gameday=self.gameday, state_data=state_data)

        # Access via related_name
        self.assertTrue(hasattr(self.gameday, "designer_state"))
        self.assertEqual(self.gameday.designer_state.state_data, state_data)

    def test_cascade_delete_when_gameday_deleted(self):
        """Test that designer state is deleted when gameday is deleted."""
        state_data = {"nodes": [], "edges": [], "globalTeams": []}

        GamedayDesignerState.objects.create(gameday=self.gameday, state_data=state_data)

        gameday_id = self.gameday.pk
        self.gameday.delete()

        # Designer state should be deleted via CASCADE
        self.assertFalse(
            GamedayDesignerState.objects.filter(gameday_id=gameday_id).exists()
        )

    def test_one_to_one_constraint_enforcement(self):
        """Test that only one designer state can exist per gameday."""
        state_data = {"nodes": [], "edges": [], "globalTeams": []}

        # Create first designer state
        GamedayDesignerState.objects.create(gameday=self.gameday, state_data=state_data)

        # Attempt to create second designer state for same gameday
        with self.assertRaises(IntegrityError):
            GamedayDesignerState.objects.create(
                gameday=self.gameday, state_data={"nodes": [{"id": "2"}]}
            )


class GamedayServiceDesignerDataTests(TestCase):
    def setUp(self):
        # Create required foreign key objects
        season = Season.objects.create(name="2026")
        league = League.objects.create(name="Test League")

        # Create default author user (ID 1 is required by Gameday default)
        author = User.objects.create_user(username="author", id=1)

        self.gameday = Gameday.objects.create(
            name="Test Gameday",
            date="2026-03-01",
            season=season,
            league=league,
            start="10:00:00",
            author=author,
        )

    def test_get_resolved_designer_data_from_new_model(self):
        """Test service reads from new model."""
        state_data = {
            "nodes": [{"id": "n1", "type": "game"}],
            "edges": [{"id": "e1"}],
            "globalTeams": [],
        }

        GamedayDesignerState.objects.create(gameday=self.gameday, state_data=state_data)

        service = GamedayService.create(self.gameday.pk)
        result = service.get_resolved_designer_data(self.gameday.pk)

        self.assertEqual(result["nodes"], state_data["nodes"])
        self.assertEqual(result["edges"], state_data["edges"])

    def test_get_resolved_designer_data_returns_empty_when_none(self):
        """Test service returns empty structure when no data exists."""
        service = GamedayService.create(self.gameday.pk)
        result = service.get_resolved_designer_data(self.gameday.pk)

        self.assertEqual(result, {"nodes": [], "edges": []})
