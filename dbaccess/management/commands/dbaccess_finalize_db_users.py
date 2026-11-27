"""Finish the per-request account backfill once no session is in flight.

The schema migration deliberately leaves rows that were live at deploy time on
their old ``dbeaver_prod_<handle>`` name: renaming only the ledger while the
MySQL account still has the old name would make the reaper kill the session as
orphaned. Run this command after the last such session has been dropped.

Idempotent: a row already carrying its per-request name is left alone.
"""

from django.core.management.base import BaseCommand

from dbaccess.accounts import db_user_for, is_legacy_db_user

# Same live set as the migration and the host reaper's verdict query.
LIVE_STATES = ("approved", "active", "revoke_requested", "expired")


class Command(BaseCommand):
    help = (
        "Backfill old per-person db_user values that are no longer backed by a session"
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report the rows that would change without writing anything",
        )

    def handle(self, *args, **options):
        from dbaccess.models import AccessRequest

        dry_run = options["dry_run"]
        changed = 0
        skipped_live = 0

        for row in AccessRequest.objects.all().iterator():
            if not is_legacy_db_user(row.db_user):
                continue
            if row.state in LIVE_STATES:
                skipped_live += 1
                continue

            new_name = db_user_for(row.person, row.pk)
            if dry_run:
                self.stdout.write(f"{row.pk}: {row.db_user} -> {new_name}")
                changed += 1
                continue

            old_name = row.db_user
            row.db_user = new_name
            row.save(update_fields=["db_user"])
            row.log(
                "migration",
                "db_user-migrated",
                detail=f"{old_name} -> {new_name}",
            )
            changed += 1

        verb = "would be updated" if dry_run else "updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"{changed} row(s) {verb}; {skipped_live} still live and left alone"
            )
        )
