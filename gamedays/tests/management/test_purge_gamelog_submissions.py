from datetime import timedelta
from io import StringIO
from uuid import uuid4

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from gamedays.models import Gameinfo, GameLogSubmission
from gamedays.tests.setup_factories.db_setup import DBSetup


class PurgeGameLogSubmissionsTest(TestCase):
    def setUp(self):
        DBSetup().g62_status_empty()
        self.game = Gameinfo.objects.first()

    def submission(self, age_days):
        row = GameLogSubmission.objects.create(gameinfo=self.game, client_id=uuid4())
        # auto_now_add ignores the constructor, so backdate it explicitly.
        GameLogSubmission.objects.filter(pk=row.pk).update(
            created_at=timezone.now() - timedelta(days=age_days)
        )
        return row

    def test_deletes_only_old_rows(self):
        old = self.submission(age_days=8)
        recent = self.submission(age_days=1)

        out = StringIO()
        call_command("purge_gamelog_submissions", "--days", "7", stdout=out)

        assert not GameLogSubmission.objects.filter(pk=old.pk).exists()
        assert GameLogSubmission.objects.filter(pk=recent.pk).exists()
        assert "Deleted 1 game log submission(s)" in out.getvalue()

    def test_default_retention_is_seven_days(self):
        just_inside = self.submission(age_days=6)
        just_outside = self.submission(age_days=8)

        call_command("purge_gamelog_submissions", stdout=StringIO())

        assert GameLogSubmission.objects.filter(pk=just_inside.pk).exists()
        assert not GameLogSubmission.objects.filter(pk=just_outside.pk).exists()

    def test_non_positive_days_is_rejected(self):
        """``--days 0`` would delete every submission (re-enabling double
        writes for outboxes that are still retrying) -- refuse instead."""
        recent = self.submission(age_days=1)

        for days in ("0", "-1"):
            with self.assertRaisesMessage(CommandError, "--days must be >= 1"):
                call_command("purge_gamelog_submissions", "--days", days)

        assert GameLogSubmission.objects.filter(pk=recent.pk).exists()
