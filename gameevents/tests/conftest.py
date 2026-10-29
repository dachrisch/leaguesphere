"""Foreign keys must break here, not only in CI.

Django's SQLite backend already runs ``PRAGMA foreign_keys = ON`` on every
connection, so a dangling reference does fail -- but two things still hid the
bug behind #2125 from this suite:

- Django declares every SQLite foreign key ``DEFERRABLE INITIALLY DEFERRED``
  and checks it when a test tears down, i.e. before the test's always-rolled-
  back transaction goes away. A write that leaves a bad reference is therefore
  only caught when that check runs; nothing in this suite relied on it.
- The first ``User`` a test creates gets id 1 on SQLite, and every test starts
  from an empty table. A write that leans on ``TeamLog.author``'s
  ``default=1`` therefore accidentally points at a real user here, while
  MySQL's auto-increment is not rolled back between tests: in CI no user 1
  exists and the insert is rejected (``IntegrityError ... FK auth_user``).

So this conftest makes the local run look like the CI database:

- :func:`no_default_user` burns user id 1 once per session (a committed
  insert+delete pages ``sqlite_sequence`` forward), so no test can create it
  and any writer that falls back to ``default=1`` writes a dangling author.
- :func:`pytest_runtest_call` checks ``PRAGMA foreign_key_check`` after every
  database test, while the rows still exist, so that dangling author fails
  here. ``TestCase`` classes keep Django's own teardown check; this hook covers
  the plain ``pytest.mark.django_db`` tests this directory is made of.
"""

import pytest
from django.contrib.auth.models import User
from django.db import connection


@pytest.fixture(scope="session", autouse=True)
def no_default_user(django_db_setup, django_db_blocker):
    """Use user ids above 1, like a database that has already been written to."""

    with django_db_blocker.unblock():
        User.objects.create(username="__reserved_user_id_1__").delete()
    yield


@pytest.hookimpl(wrapper=True)
def pytest_runtest_call(item):
    """Check every SQLite database test's foreign keys before its rows roll back.

    MySQL already rejects a dangling reference at the statement, so there is
    nothing to check there (and its ``check_constraints`` would scan every
    table of the test database after every test).
    """

    # A failing test propagates through the yield, so the check never runs for
    # it and cannot mask the real failure.
    outcome = yield
    uses_db = (
        item.get_closest_marker("django_db") is not None
        or "db" in item.fixturenames
        or "transactional_db" in item.fixturenames
    )
    if uses_db and connection.vendor == "sqlite":
        with connection.cursor() as cursor:
            cursor.execute("PRAGMA foreign_keys = ON")
        # Runs before Django's teardown rolls the transaction back: a row that
        # points at a user, team or game which does not exist fails the test.
        connection.check_constraints()
    return outcome
