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
