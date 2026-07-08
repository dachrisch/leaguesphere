from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from officials.models import MoodleRememberToken, Official
from officials.tests.setup_factories.db_setup_officials import DbSetupOfficials


class TestMoodleRememberTokenModel(TestCase):
    def setUp(self):
        DbSetupOfficials().create_officials_and_team()
        self.official = Official.objects.first()

    def test_is_expired_reflects_expires_at(self):
        past = MoodleRememberToken.objects.create(
            selector="sel-past",
            validator_hash="x",
            official=self.official,
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        future = MoodleRememberToken.objects.create(
            selector="sel-future",
            validator_hash="x",
            official=self.official,
            expires_at=timezone.now() + timedelta(days=1),
        )
        assert past.is_expired() is True
        assert future.is_expired() is False

    def test_deleting_official_cascade_deletes_tokens(self):
        MoodleRememberToken.objects.create(
            selector="sel-cascade",
            validator_hash="x",
            official=self.official,
            expires_at=timezone.now() + timedelta(days=1),
        )
        self.official.delete()
        assert MoodleRememberToken.objects.filter(selector="sel-cascade").count() == 0
