import pytest
from gamedays.api.serializers import GamedayListSerializer, GamedaySerializer
from gamedays.tests.setup_factories.db_setup import DBSetup


@pytest.mark.django_db
class TestGamedaySerializers:
    def test_list_serializer_includes_designer_data(self):
        gameday = DBSetup().create_empty_gameday()
        gameday.designer_data = {"test": "data"}
        gameday.save()

        serializer = GamedayListSerializer(instance=gameday)
        assert "designer_data" in serializer.data
        assert serializer.data["designer_data"] == {"test": "data"}

    def test_gameday_serializer_to_representation(self):
        gameday = DBSetup().create_empty_gameday()
        gameday.designer_data = {"nodes": [], "edges": []}
        gameday.save()

        serializer = GamedaySerializer(instance=gameday)
        # Should call to_representation and resolve data
        assert "designer_data" in serializer.data
        assert "nodes" in serializer.data["designer_data"]

    def test_gameday_serializer_to_representation_fallback(self):
        gameday = DBSetup().create_empty_gameday()
        gameday.designer_data = {"test": "raw"}
        gameday.save()

        # We don't easily mock GamedayService.create failure here,
        # but we can verify it doesn't crash.
        serializer = GamedaySerializer(instance=gameday)
        assert "designer_data" in serializer.data
