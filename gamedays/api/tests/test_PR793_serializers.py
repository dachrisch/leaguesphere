import pytest
from gamedays.api.serializers import GamedayListSerializer, GamedaySerializer
from gamedays.models import GamedayDesignerState
from gamedays.tests.setup_factories.db_setup import DBSetup


@pytest.mark.django_db
class TestGamedaySerializers:
    def test_list_serializer_includes_designer_data(self):
        gameday = DBSetup().create_empty_gameday()

        # Create designer state in new model
        GamedayDesignerState.objects.create(
            gameday=gameday, state_data={"test": "data"}
        )

        serializer = GamedayListSerializer(instance=gameday)
        assert "designer_data" in serializer.data
        assert serializer.data["designer_data"] == {"test": "data"}

    def test_gameday_serializer_to_representation(self):
        """Test GamedaySerializer reads from GamedayDesignerState model."""
        gameday = DBSetup().create_empty_gameday()

        # Create designer state in new model
        GamedayDesignerState.objects.create(
            gameday=gameday, state_data={"nodes": [], "edges": []}
        )

        serializer = GamedaySerializer(instance=gameday)
        assert "designer_data" in serializer.data
        assert "nodes" in serializer.data["designer_data"]

    def test_gameday_serializer_to_representation_fallback(self):
        """Test GamedaySerializer returns None when no designer state exists."""
        gameday = DBSetup().create_empty_gameday()

        serializer = GamedaySerializer(instance=gameday)
        assert "designer_data" in serializer.data
        assert serializer.data["designer_data"] is None
