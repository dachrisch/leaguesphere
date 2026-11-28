"""Starting a game must witness the required setup choices in the UI."""

from __future__ import annotations

from pathlib import Path
import sys
import types

ROOT = Path(__file__).resolve().parents[4]
for part in ("scripts/equivalence", "scripts/equivalence/frontend"):
    sys.path.insert(0, str(ROOT / part))

from journeys import scorecard_v2_gamesetup as setup  # noqa: E402


def test_assign_officials_waits_for_every_debounced_search():
    # PersonPicker debounces its search by 250 ms. Clicking the free-text
    # button immediately after `fill` lets some searches fire and others not,
    # so two runs of the same side captured different API request lists.
    class Waiter:
        def __init__(self, page):
            self.page = page

        def __enter__(self):
            self.page.waits.append("search")
            return self

        def __exit__(self, *args):
            return False

    class Page:
        def __init__(self):
            self.waits = []
            self.filled = []

        def locator(self, selector):
            if selector == setup.OFFICIAL_SEARCH:
                return types.SimpleNamespace(
                    first=types.SimpleNamespace(
                        fill=lambda value: self.filled.append(value)
                    )
                )
            return types.SimpleNamespace(
                count=lambda: 1,
                first=types.SimpleNamespace(click=lambda **kwargs: None),
            )

        def expect_response(self, predicate, timeout):
            response = types.SimpleNamespace(
                url="https://stage/api/officials/search/list?name=x",
                request=types.SimpleNamespace(method="GET"),
            )
            assert predicate(response)
            return Waiter(self)

    page = Page()
    setup._assign_officials(page, [])
    assert page.waits == ["search"] * 4
    assert page.filled == [f"Equivalence Official {index}" for index in range(1, 5)]


def test_gamesetup_selects_toss_possession_and_direction(monkeypatch):
    seen = []

    def fake_run_steps(context, path, steps, skipped, actions=(), **kwargs):
        for name, action in actions:
            seen.append(
                (
                    name,
                    getattr(action, "__closure__", None)
                    and action.__closure__[0].cell_contents,
                )
            )

    monkeypatch.setattr(setup, "run_steps", fake_run_steps)
    monkeypatch.setattr(
        setup.fixture,
        "create",
        lambda view, run_id: {"gameday_id": 1, "game_id": 2},
    )
    monkeypatch.setattr(setup.fixture, "cleanup", lambda view, game: True)
    monkeypatch.setattr(setup, "id_tokens", lambda mapping, run_id: {})
    monkeypatch.setattr(setup, "role_view", lambda context, role: object())

    setup.run(types.SimpleNamespace(), "fe-ref", {})

    selectors = [s for _, s in seen if isinstance(s, str)]
    assert any('aria-label="Münzwurf gewonnen von"' in s for s in selectors)
    assert any('aria-label="Erster Ballbesitz"' in s for s in selectors)
    assert any('aria-label="Spielrichtung"' in s for s in selectors)
    assert any(
        name == "officials" for name, _ in seen
    ), "required officials must be entered before the start button is enabled"
