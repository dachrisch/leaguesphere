"""Delete old ``GameLogSubmission`` rows (they grow with every log write).

A submission only has to outlive the retries of its client's outbox, so the
default window of a week is generous. Scheduling the command is deployment's
job; run it from cron/Ofelia.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from gamedays.models import GameLogSubmission


class Command(BaseCommand):
    help = "Delete game log submissions older than --days days."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=7,
            help="Keep submissions younger than this many days (default: 7).",
        )

    def handle(self, *args, **options):
        days = options["days"]
        # ``--days 0`` (or a negative) would put the cutoff at now/in the
        # future and delete EVERY submission -- i.e. re-enable duplicate
        # writes for every still-retrying outbox. Refuse instead.
        if days < 1:
            raise CommandError("--days must be >= 1")
        cutoff = timezone.now() - timedelta(days=days)
        deleted, _ = GameLogSubmission.objects.filter(created_at__lt=cutoff).delete()
        self.stdout.write(
            self.style.SUCCESS(
                f"Deleted {deleted} game log submission(s) older than {days} day(s)."
            )
        )
