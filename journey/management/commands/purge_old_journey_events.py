"""Delete JourneyEvent rows older than a retention window, so the uncapped
metadata JSONField stops growing without bound. Dry-run unless --execute.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from journey.models import JourneyEvent

DEFAULT_RETENTION_DAYS = 90


class Command(BaseCommand):
    help = (
        "Delete JourneyEvent rows older than --days (default "
        f"{DEFAULT_RETENTION_DAYS}). Dry-run by default."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=DEFAULT_RETENTION_DAYS,
            help=f"Retention window in days (default {DEFAULT_RETENTION_DAYS}).",
        )
        parser.add_argument(
            "--execute",
            action="store_true",
            help="Actually delete the events. Without it, this is a dry-run.",
        )

    def handle(self, *args, **opts):
        days = opts["days"]
        execute = opts["execute"]
        if days <= 0:
            # 0 or negative would put the cutoff at/after now.
            raise CommandError(f"--days must be a positive integer (got {days}).")
        cutoff = timezone.now() - timedelta(days=days)
        stale_events = JourneyEvent.objects.filter(created_at__lt=cutoff)
        count = stale_events.count()

        mode = "EXECUTE" if execute else "DRY RUN"
        self.stdout.write(
            self.style.WARNING(f"=== purge_old_journey_events [{mode}] ===")
        )
        self.stdout.write(
            f"{count} event(s) older than {days} days (before {cutoff.isoformat()})."
        )

        if not execute:
            self.stdout.write(
                self.style.WARNING(
                    "Dry-run: nothing deleted. Pass --execute to delete."
                )
            )
            return

        stale_events.delete()
        self.stdout.write(self.style.SUCCESS(f"Deleted {count} event(s)."))
