"""``reset_demo_database --recreate-database``: the demo's nightly reset.

The reset drops and recreates the database instead of flushing it. A flush
keeps ``django_migrations``, so data migrations (the default
``SiteConfiguration`` from ``league_manager.0002`` and the tie-break steps and
rulesets from ``league_table.0011``) are recorded as applied but their rows are
gone — the demo then runs without maintenance config and without league-table
tie-break rules.

The SQL is asserted through a recording connection because dropping the
pytest-managed database mid-test would destroy the schema the rest of the
suite runs against. The real statement pair is exercised by the demo deploy.
"""

from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from league_manager.management.commands import reset_demo_database as command_module


class RecordingCursor:
    def __init__(self, statements):
        self.statements = statements

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False

    def execute(self, sql, params=None):
        self.statements.append(str(sql))


class RecordingConnection:
    def __init__(self, statements):
        self.statements = statements
        self.closed = False

    def cursor(self):
        return RecordingCursor(self.statements)

    def close(self):
        self.closed = True


@pytest.fixture
def recording_connection(monkeypatch):
    statements = []
    connection = RecordingConnection(statements)
    monkeypatch.setattr(command_module, "connection", connection)
    return connection, statements


@pytest.mark.django_db
def test_recreate_database_drops_and_creates_the_schema(recording_connection):
    connection, statements = recording_connection
    database = command_module.settings.DATABASES["default"]["NAME"]

    out = StringIO()
    call_command("reset_demo_database", "--recreate-database", stdout=out)

    assert statements == [
        f"DROP DATABASE IF EXISTS `{database}`",
        f"CREATE DATABASE `{database}` "
        "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
    ]
    assert connection.closed, "the connection must be closed before the reset"

    output = out.getvalue().lower()
    assert "recreated" in output
    assert database.lower() in output


@pytest.mark.django_db
def test_recreate_database_rejects_a_non_mysql_backend(monkeypatch):
    monkeypatch.setitem(
        command_module.settings.DATABASES["default"],
        "ENGINE",
        "django.db.backends.sqlite3",
    )

    with pytest.raises(CommandError, match="MySQL"):
        call_command("reset_demo_database", "--recreate-database")


@pytest.mark.django_db
def test_command_requires_the_recreate_flag():
    with pytest.raises(CommandError, match="--recreate-database"):
        call_command("reset_demo_database")
