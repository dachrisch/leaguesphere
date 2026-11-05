"""Recreate the demo database so the nightly reset is a real reset.

``container/entrypoint.demo.sh`` runs this once per UTC day (scheduled by
Ofelia in ``deployed/docker-compose.demo.yaml``), then applies migrations and
seeds the demo data.

The database is **dropped and recreated** rather than flushed. ``flush`` keeps
``django_migrations``, so data migrations are recorded as applied but never run
again — the demo would lose the default ``SiteConfiguration``
(``league_manager.0002``) and the league tie-break steps and rulesets
(``league_table.0011``). A fresh database replays them.

Dropping the database needs the ``DROP`` privilege on it; the demo user gets
``GRANT ALL PRIVILEGES ON demo_db.*`` from ``deployed/mysql-init``, and MariaDB
keeps those grants across ``DROP DATABASE``.
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection

MYSQL_ENGINE = "django.db.backends.mysql"


def quote_identifier(identifier: str) -> str:
    """Quote a MySQL identifier (the database name) with backticks."""
    return f"`{identifier.replace('`', '``')}`"


class Command(BaseCommand):
    help = "Drop and recreate the demo database (run migrations afterwards)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--recreate-database",
            action="store_true",
            help="Drop the configured database and create it empty.",
        )

    def handle(self, *args, **options):
        if not options.get("recreate_database"):
            raise CommandError("Specify --recreate-database")
        self.recreate_database()

    def recreate_database(self):
        db_settings = settings.DATABASES["default"]
        if db_settings["ENGINE"] != MYSQL_ENGINE:
            raise CommandError(
                "--recreate-database requires the MySQL backend, got "
                f"{db_settings['ENGINE']}"
            )

        database = db_settings["NAME"]
        identifier = quote_identifier(database)

        # Close first: a pooled connection keeps pointing at the database that
        # is about to disappear, and reopening it after the drop would fail.
        connection.close()
        with connection.cursor() as cursor:
            cursor.execute(f"DROP DATABASE IF EXISTS {identifier}")
            cursor.execute(
                f"CREATE DATABASE {identifier} "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
        connection.close()

        self.stdout.write(
            self.style.SUCCESS(f"✓ Demo database {database} dropped and recreated")
        )
