"""container/entrypoint.demo.sh: what the demo reset runs, in which order.

The script runs against a temporary app directory (``DEMO_APP_DIR``) with a
fake ``python`` on ``PATH`` that only records its arguments, so the test sees
the management commands without a database.
"""

import os
import stat
import subprocess
from pathlib import Path

import pytest

ENTRYPOINT = Path(__file__).resolve().parents[2] / "container" / "entrypoint.demo.sh"

FAKE_PYTHON = """#!/bin/bash
echo "$*" >> "$CALLS"
for arg in "$@"; do
  case "$arg" in
    --snapshot-path=*) [ "$2" = "reset_demo_database" ] && [ "$3" = "--create-snapshot" ] \\
        && mkdir -p "$(dirname "${arg#*=}")" && touch "${arg#*=}" ;;
  esac
done
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


def test_first_run_seeds_snapshots_and_then_adds_todays_scorecard_gameday(demo_app):
    _, run = demo_app

    calls = run()

    assert commands(calls) == [
        "migrate",
        "seed_demo_data",
        "reset_demo_database",
        "seed_scorecard_demo",
    ]
    assert "--create-snapshot" in calls[2]


def test_a_reset_from_the_snapshot_adds_todays_scorecard_gameday(demo_app):
    app, run = demo_app
    snapshot = app / "snapshots" / "demo_snapshot.sql"
    snapshot.parent.mkdir()
    snapshot.touch()

    calls = run()

    assert commands(calls) == ["reset_demo_database", "seed_scorecard_demo"]
    assert "--restore-snapshot" in calls[0]


def test_no_reset_needed_seeds_nothing(demo_app):
    app, run = demo_app
    first = len(run())

    # The flag from the first run says today's reset is done; the log of
    # calls only grows when a command runs.
    assert (app / ".demo_last_reset").exists()
    assert len(run()) == first
