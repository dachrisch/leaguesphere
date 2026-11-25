"""Tests for scripts/check_app_boundaries.py.

Guards the Phase 0a dependency boundary (dachrisch/leaguesphere#2536):
`gamedays` is the core domain app, and the five consumer apps
(`league_table`, `gameday_designer`, `officials`, `passcheck`,
`liveticker`) must not be imported back from it. `gameevents` is the one
allowed exception (it writes gamedays projection tables through its
projector boundary), so it is reported but never fails.

The allowlist is seeded from the current imports and can only shrink:
an import that is not listed fails, and a listed entry with no
corresponding import (stale) fails too.

Note: no fixture files are committed - every case builds its own tree
under `tmp_path`, so the tests cannot drift with the real `gamedays/`.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import check_app_boundaries  # noqa: E402  (path set up above)


@pytest.fixture()
def checker():
    return check_app_boundaries


def write_root(tmp_path, files):
    for relative_path, content in files.items():
        path = tmp_path / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    return tmp_path


def write_allowlist(tmp_path, *entries):
    path = tmp_path / "allowlist.txt"
    path.write_text("".join(f"{entry}\n" for entry in entries), encoding="utf-8")
    return path


def test_unknown_import_fails(checker, tmp_path, capsys):
    root = write_root(
        tmp_path,
        {
            "gamedays/views.py": (
                "from officials.service.signup_service import OfficialSignupService\n"
            )
        },
    )
    allowlist = write_allowlist(tmp_path)

    assert checker.main(["--root", str(root), "--allowlist", str(allowlist)]) == 1
    assert "officials" in capsys.readouterr().out


def test_gameevents_is_allowed(checker, tmp_path):
    root = write_root(
        tmp_path,
        {
            "gamedays/service/append.py": (
                "from gameevents.service.append import append_submission\n"
            )
        },
    )
    allowlist = write_allowlist(tmp_path)

    assert checker.main(["--root", str(root), "--allowlist", str(allowlist)]) == 0


def test_allowlisted_import_passes(checker, tmp_path):
    statement = "from league_table.models import LeagueGroup"
    root = write_root(tmp_path, {"gamedays/views.py": f"{statement}\n"})
    allowlist = write_allowlist(
        tmp_path, f"gamedays/views.py|{statement}  # Phase 1 - detail context"
    )

    assert checker.main(["--root", str(root), "--allowlist", str(allowlist)]) == 0


def test_stale_allowlist_entry_fails(checker, tmp_path, capsys):
    root = write_root(tmp_path, {"gamedays/views.py": "import gamedays.models\n"})
    allowlist = write_allowlist(
        tmp_path,
        "gamedays/views.py|from league_table.models import LeagueGroup"
        "  # Phase 1 - detail context",
    )

    assert checker.main(["--root", str(root), "--allowlist", str(allowlist)]) == 1
    assert "stale" in capsys.readouterr().out.lower()


def test_plain_import_statement_is_normalised(checker, tmp_path, capsys):
    root = write_root(
        tmp_path, {"gamedays/models.py": "import league_table.models as lt, os\n"}
    )
    allowlist = write_allowlist(tmp_path)

    assert checker.main(["--root", str(root), "--allowlist", str(allowlist)]) == 1
    assert "league_table.models as lt" in capsys.readouterr().out


def test_relative_imports_are_ignored(checker, tmp_path):
    root = write_root(
        tmp_path,
        {
            "gamedays/relative.py": (
                "from . import officials\nfrom .models import something\n"
            )
        },
    )
    allowlist = write_allowlist(tmp_path)

    assert checker.main(["--root", str(root), "--allowlist", str(allowlist)]) == 0


def test_excluded_paths_are_not_scanned(checker, tmp_path):
    root = write_root(
        tmp_path,
        {
            "gamedays/tests/test_views.py": "import league_table\n",
            "gamedays/migrations/0001_initial.py": "import league_table\n",
            "gamedays/test_helpers.py": "import league_table\n",
            "gamedays/helpers_test.py": "import league_table\n",
            "gamedays/service/real.py": "import gamedays.models\n",
        },
    )
    allowlist = write_allowlist(tmp_path)

    assert checker.main(["--root", str(root), "--allowlist", str(allowlist)]) == 0


def test_unparsable_module_fails_closed(checker, tmp_path):
    root = write_root(tmp_path, {"gamedays/broken.py": "def broken(:\n"})
    allowlist = write_allowlist(tmp_path)

    with pytest.raises(SystemExit) as error:
        checker.main(["--root", str(root), "--allowlist", str(allowlist)])

    assert "cannot parse" in str(error.value)


def test_missing_allowlist_is_treated_as_empty(checker, tmp_path):
    root = write_root(tmp_path, {"gamedays/service/append.py": "import gameevents\n"})

    assert (
        checker.main(
            ["--root", str(root), "--allowlist", str(tmp_path / "missing.txt")]
        )
        == 0
    )


def test_generate_writes_tagged_entries(checker, tmp_path, capsys):
    root = write_root(
        tmp_path,
        {
            "gamedays/views.py": "from league_table.models import LeagueGroup\n",
            "gamedays/api/views.py": "from officials.urls import OFFICIALS\n",
            "gamedays/service/signals.py": "import gameday_designer.models\n",
            "gamedays/service/gamelog.py": "import gameevents.service.log_payload\n",
        },
    )
    allowlist = tmp_path / "nested" / "allowlist.txt"

    assert (
        checker.main(
            [
                "--root",
                str(root),
                "--generate",
                "--allowlist",
                str(allowlist),
            ]
        )
        == 0
    )

    written = allowlist.read_text()
    assert "Phase 1 — detail context" in written
    assert "Phase 1 — API context" in written
    assert "Phase 1 — scheduling registry" in written
    assert "|import gameevents" not in written
    output = capsys.readouterr().out
    assert "3 entries written (gameevents allowed, not listed)" in output
