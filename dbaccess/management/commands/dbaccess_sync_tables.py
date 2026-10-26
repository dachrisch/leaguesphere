"""Seed the curated table list from the live schema.

Run once after deploy, and again whenever the schema changes:

    python manage.py dbaccess_sync_tables

Tables on ``NEVER_GRANTABLE`` are inserted with ``grantable=False`` rather than
skipped, so the request form can explain why they are missing instead of the
person inventing a name that the sidecar will reject three minutes later.
"""

from django.core.management.base import BaseCommand
from django.db import connection

from dbaccess.models import GrantableTable

# Identity, sessions and the admin log: nobody needs these to repair data, and
# every one of them is a credential or a trail in itself.
NEVER_GRANTABLE = {
    "auth_user": "user accounts and password hashes",
    "auth_user_groups": "user accounts",
    "auth_user_user_permissions": "user accounts",
    "auth_permission": "permission definitions",
    "django_session": "session keys",
    "django_admin_log": "the admin audit trail",
    "django_migrations": "schema state",
    "django_content_type": "framework metadata",
}


class Command(BaseCommand):
    help = "Sync GrantableTable with the tables that exist in the database."

    def handle(self, *args, **options):
        # Django's introspection instead of information_schema: the same call
        # works on MariaDB in prod and on SQLite in the test suite, so the
        # command is testable without a MySQL service.
        names = sorted(connection.introspection.table_names())

        created = updated = 0
        for name in names:
            note = NEVER_GRANTABLE.get(name, "")
            obj, was_created = GrantableTable.objects.update_or_create(
                name=name,
                defaults={"grantable": not note, "note": note},
            )
            created += int(was_created)
            updated += int(not was_created)

        self.stdout.write(
            self.style.SUCCESS(
                f"dbaccess_sync_tables: {len(names)} tables "
                f"({created} new, {updated} existing), "
                f"{len(NEVER_GRANTABLE)} permanently withheld"
            )
        )
