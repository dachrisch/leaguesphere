"""Fixtures for the two-phone offline scenarios.

The tests live outside the default pytest run on purpose (see ``pytest.ini``):
they start two Chromium processes and a live server, which is far too heavy for
CI and needs a machine with a display for the headed run.
"""

from __future__ import annotations

import os

# Must be set before any Django import: the tests read the ORM while the live
# server writes the same database from another thread.
os.environ.setdefault("DJANGO_ALLOW_ASYNC_UNSAFE", "true")

import re  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from django.core.servers.basehttp import WSGIServer  # noqa: E402
from django.test.testcases import LiveServerThread  # noqa: E402

from scorecard_v2.tests.e2e_scenarios.harness import (  # noqa: E402
    PASSWORD,
    USERNAME,
    Phone,
    Report,
    database_is_sqlite,
    make_user,
    seed_club_game,
)


class SingleThreadedWSGIServer(WSGIServer):
    """Handle one request at a time so SQLite does not raise SQLITE_LOCKED.

    SQLite ignores ``select_for_update``; serialising requests at the server is
    the only application-level fix. MariaDB must stay threaded so the real
    races in S08/S12 can happen.
    """

    def __init__(self, *args, connections_override=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.connections_override = connections_override or {}


@pytest.fixture(autouse=True)
def _live_server_mode():
    # Belt and braces for a server started after this fixture runs.
    LiveServerThread.server_class = (
        SingleThreadedWSGIServer if database_is_sqlite() else WSGIServer
    )
    yield


# The class attribute is read when the server thread starts, and pytest 9 may
# set up the explicit ``live_server`` fixture before an autouse function-scoped
# fixture. Set it at import time too, while the settings module is known.
try:
    if database_is_sqlite():
        LiveServerThread.server_class = SingleThreadedWSGIServer
except Exception:  # pragma: no cover - settings not ready in an odd runner
    if "test_sqlite" in os.environ.get("DJANGO_SETTINGS_MODULE", ""):
        LiveServerThread.server_class = SingleThreadedWSGIServer


def _slug(nodeid: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.-]+", "-", nodeid).strip("-")


@pytest.fixture(scope="session")
def report(pytestconfig: pytest.Config):
    directory = Path(pytestconfig.rootpath) / "test-reports" / "offline-scenarios"
    instance = Report(directory)
    yield instance
    instance.write()


@pytest.fixture
def club_user(db):
    return make_user(USERNAME, PASSWORD)


@pytest.fixture
def staff_user(db):
    user = make_user("scorecardv2staff", PASSWORD, is_staff=True)
    return {"username": user.username, "password": PASSWORD, "user": user}


@pytest.fixture
def other_club_user(db):
    user = make_user("scorecardv2other", PASSWORD)
    return {"username": user.username, "password": PASSWORD, "user": user}


@pytest.fixture
def club_game(db, club_user):
    return seed_club_game()


@pytest.fixture
def phones(
    live_server,
    browser_type_launch_args,
    playwright,
    tmp_path,
    club_user,
    report,
    request,
):
    artifacts = report.directory / _slug(request.node.nodeid)
    profiles = tmp_path / "profiles"
    phone_a = Phone(
        "A",
        profiles / "a",
        live_server.url,
        playwright,
        browser_type_launch_args,
        window_x=0,
        artifact_dir=artifacts,
    )
    phone_b = Phone(
        "B",
        profiles / "b",
        live_server.url,
        playwright,
        browser_type_launch_args,
        window_x=620,
        artifact_dir=artifacts,
    )
    try:
        for phone in (phone_a, phone_b):
            phone.start()
            phone.login(USERNAME, PASSWORD)
        yield [phone_a, phone_b]
    finally:
        for phone in (phone_a, phone_b):
            phone.close()
