from unittest.mock import patch, MagicMock

from django.test import TestCase

from gamedays.models import Gameinfo
from gamedays.tests.setup_factories.db_setup import DBSetup


class TestSignals(TestCase):

    @patch('gamedays.service.signals.GamedayScheduleResolutionService')
    def test_schedule_is_updated(self, service_mock):
        # Setup mock to track update_participants calls
        mock_instance = MagicMock()
        service_mock.return_value = mock_instance
        mock_instance.gmw.is_finished.return_value = True

        DBSetup().g62_status_empty()

        gi: Gameinfo = Gameinfo.objects.first()
        gi.status = "beendet"
        gi.save()

        # Verify the service was instantiated and update_participants was called
        service_mock.assert_called_once_with(gi.gameday_id)
        mock_instance.update_participants.assert_called()
