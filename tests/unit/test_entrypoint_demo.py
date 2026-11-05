"""container/entrypoint.demo.sh: what the demo reset runs, in which order.

The script runs against a temporary app directory (``DEMO_APP_DIR``) with a
fake ``python`` on ``PATH`` that only records its arguments, so the test sees
the management commands without a database.

The reset must rebuild the database from migrations instead of flushing it:
``flush`` keeps the migration table, so data migrations (the default
``SiteConfiguration``, the league tie-break steps and rulesets) never run again
and their rows are lost.
"""

import os
import stat
import subprocess
from pathlib import Path

import pytest

ENTRYPOINT = Path(__file__).resolve().parents[2] / "container" / "entrypoint.demo.sh"

FAKE_PYTHON = """#!/bin/bash
echo "$*" >> "$CALLS"
"""


@pytest.fixture
def demo_app(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    python = bin_dir / "python"
    python.write_text(FAKE_PYTHON)
    python.chmod(python.stat().st_mode | stat.S_IEXEC)
    app = tmp_path / "app"
    app.mkdir()
    calls = tmp_path / "calls.log"

    def run():
        env = {
            **os.environ,
            "PATH": f"{bin_dir}:{os.environ['PATH']}",
            "DEMO_APP_DIR": str(app),
            "CALLS": str(calls),
        }
        subprocess.run(["bash", str(ENTRYPOINT)], env=env, check=True)
        lines = calls.read_text().splitlines() if calls.exists() else []
        return [line.removeprefix("manage.py ") for line in lines]

    return app, run


def commands(calls):
    return [call.split()[0] for call in calls]


def test_first_run_recreates_migrates_and_seeds(demo_app):
    _, run = demo_app

    calls = run()

    assert commands(calls) == [
        "reset_demo_database",
        "migrate",
        "seed_demo_data",
        "seed_scorecard_demo",
    ]
    assert calls[0].split()[1] == "--recreate-database"
    assert "--noinput" in calls[1]


def test_migrate_runs_after_the_database_is_recreated(demo_app):
    """Data migrations only replay on a database that was dropped first."""
    _, run = demo_app

    calls = run()

    commands_in_order = commands(calls)
    assert commands_in_order.index("reset_demo_database") < commands_in_order.index(
        "migrate"
    )
    assert commands_in_order.index("migrate") < commands_in_order.index(
        "seed_demo_data"
    )


def test_no_reset_needed_seeds_nothing(demo_app):
    app, run = demo_app
    first = len(run())

    # The flag from the first run says today's reset is done; the log of
    # calls only grows when a command runs.
    assert (app / ".demo_last_reset").exists()
    assert len(run()) == first
