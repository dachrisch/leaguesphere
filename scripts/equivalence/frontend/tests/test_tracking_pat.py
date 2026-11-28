"""The extra point is answered by its own choice bar, not a generic save."""

from __future__ import annotations

from pathlib import Path
import sys
import types

ROOT = Path(__file__).resolve().parents[4]
for part in ("scripts/equivalence", "scripts/equivalence/frontend"):
    sys.path.insert(0, str(ROOT / part))

from journeys import scorecard_v2_tracking as tracking  # noqa: E402


def test_tracking_answers_pat_with_the_choice_bar(monkeypatch):
    seen = []

    def fake_run_steps(context, path, steps, skipped, actions=(), **kwargs):
        for name, action in actions:
            closure = getattr(action, "__closure__", None)
            seen.append((name, closure[0].cell_contents if closure else None))

    monkeypatch.setattr(tracking, "run_steps", fake_run_steps)
    monkeypatch.setattr(
        tracking.fixture,
        "create",
        lambda view, run_id, **kwargs: {"gameday_id": 1, "game_id": 2},
    )
    monkeypatch.setattr(tracking.fixture, "cleanup", lambda view, game: True)
    monkeypatch.setattr(tracking, "id_tokens", lambda mapping, run_id: {})
    monkeypatch.setattr(tracking, "role_view", lambda context, role: object())

    tracking.run(types.SimpleNamespace(), "fe-ref", {})
    selectors = [s for _, s in seen if isinstance(s, str)]
    assert not any(
        ".sheet .sheetfoot button.startbtn" in s and False for s in selectors
    )
    assert any(
        ".patbar" in s and "+1" in s for s in selectors
    ), "the PAT must be answered with a real choice, not a missing save button"
    assert any(
        "Speichern" in s for s in selectors
    ), "the PAT detail sheet must be saved before the undo control exists"
    assert any(
        name == "play-undo" and value == "Control+z" for name, value in seen
    ), "undo is the keyboard shortcut; 'Letzten Eintrag rückgängig' is only a hint"
    names = [name for name, _ in seen]
    assert "pat-reanswer" in names and "pat-reconfirm" in names, (
        "undo removes the PAT and reopens its choice bar; it must be answered "
        "again before the halftime control is enabled"
    )
