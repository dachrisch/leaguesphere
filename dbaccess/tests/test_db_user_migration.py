"""The backfill must give historical rows their own account name without
touching the account that is still live at rollout time.

Renaming the account name on a live row while the MySQL account still carries
the old name would make the reaper see an orphan and kill the session, so the
migration is deliberately split: it backfills terminal rows now, and a
management command finalises the rest once the last in-flight session has
ended.
"""

import io

import pytest

from dbaccess.accounts import db_user_for
from dbaccess.models import AccessRequest
from gamedays.tests.setup_factories.factories import UserFactory

LEGACY = "dbeaver_prod_chrisd"


def _row(**kwargs):
    requester = kwargs.pop("requester", None) or UserFactory(username="chrisd")
    defaults = dict(
        person="chrisd",
        purpose="rehearsal",
        tables_csv="divisions",
        ttl_hours=4,
        state="dropped",
        db_user=LEGACY,
    )
    defaults.update(kwargs)
    return AccessRequest.objects.create(requester=requester, **defaults)


class _Apps:
    """The migration only needs `get_model`; pass the real ones to exercise it."""

    def get_model(self, app_label, model_name):
        assert app_label == "dbaccess"
        from dbaccess.models import AccessEvent, AccessRequest

        return {"AccessRequest": AccessRequest, "AccessEvent": AccessEvent}[model_name]


@pytest.mark.django_db
def test_migration_backfills_terminal_rows_but_leaves_live_accounts_alone():
    import importlib

    migration = importlib.import_module("dbaccess.migrations.0003_db_user_per_request")

    dropped = _row(state="dropped", db_user=LEGACY)
    live = _row(state="active", db_user=LEGACY)
    requested = _row(state="requested", db_user=None)

    migration.forwards(_Apps(), None)

    dropped.refresh_from_db()
    live.refresh_from_db()
    requested.refresh_from_db()
    assert dropped.db_user == db_user_for("chrisd", dropped.pk)
    assert live.db_user == LEGACY
    assert requested.db_user == db_user_for("chrisd", requested.pk)
    assert dropped.events.filter(
        action="db_user-migrated", detail__contains=LEGACY
    ).exists()
    assert not live.events.filter(action="db_user-migrated").exists()


@pytest.mark.django_db
def test_migration_can_be_reversed():
    import importlib

    migration = importlib.import_module("dbaccess.migrations.0003_db_user_per_request")

    row = _row(state="dropped", db_user=LEGACY)
    AccessRequest.objects.filter(pk=row.pk).update(
        db_user=db_user_for("chrisd", row.pk)
    )

    migration.backwards(_Apps(), None)

    row.refresh_from_db()
    assert row.db_user == LEGACY


@pytest.mark.django_db
def test_finalize_command_rewrites_legacy_names_that_have_since_been_dropped():
    """Rows that were live during the deploy are finalised after their reaping."""
    from django.core.management import call_command

    row = _row(state="dropped", db_user=LEGACY)
    still_live = _row(state="active", db_user=LEGACY)
    AccessRequest.objects.filter(pk__in=[row.pk, still_live.pk]).update(db_user=LEGACY)

    call_command("dbaccess_finalize_db_users")

    row.refresh_from_db()
    still_live.refresh_from_db()
    assert row.db_user == db_user_for("chrisd", row.pk)
    assert still_live.db_user == LEGACY
    assert row.events.filter(action="db_user-migrated").exists()


@pytest.mark.django_db
def test_finalize_dry_run_reports_changes_without_touching_the_ledger():
    from django.core.management import call_command

    row = _row(state="dropped", db_user=LEGACY)
    output = io.StringIO()

    call_command("dbaccess_finalize_db_users", dry_run=True, stdout=output)

    row.refresh_from_db()
    assert row.db_user == LEGACY
    assert "->" in output.getvalue()
    assert "would be updated" in output.getvalue()
    assert not row.events.filter(action="db_user-migrated").exists()


@pytest.mark.django_db
def test_finalize_command_is_idempotent():
    from django.core.management import call_command

    row = _row(state="dropped", db_user=LEGACY)
    AccessRequest.objects.filter(pk=row.pk).update(db_user=LEGACY)

    call_command("dbaccess_finalize_db_users")
    call_command("dbaccess_finalize_db_users")

    row.refresh_from_db()
    assert row.db_user == db_user_for("chrisd", row.pk)
    assert row.events.filter(action="db_user-migrated").count() == 1
