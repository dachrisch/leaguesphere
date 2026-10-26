"""The curated allow-list is seeded from the schema, and the PII never becomes grantable."""

import pytest
from django.core.management import call_command

from dbaccess.models import GrantableTable


@pytest.mark.django_db
def test_sync_marks_identity_tables_as_never_grantable():
    call_command("dbaccess_sync_tables", verbosity=0)

    rows = {row.name: row for row in GrantableTable.objects.all()}
    assert rows, "the test database has at least the auth tables"
    assert rows["auth_user"].grantable is False
    assert rows["auth_user"].note
    assert rows["dbaccess_grantabletable"].grantable is True


@pytest.mark.django_db
def test_sync_is_idempotent():
    call_command("dbaccess_sync_tables", verbosity=0)
    count = GrantableTable.objects.count()

    call_command("dbaccess_sync_tables", verbosity=0)

    assert GrantableTable.objects.count() == count
