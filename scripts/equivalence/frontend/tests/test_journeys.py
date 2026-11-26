"""Characterization of the shared journey actions (Phase 3 Layer 1).

A journey that reports steps without clicking anything is not a behaviour
witness. These tests pin that an absent required selector fails, that an
optional absence is recorded for ref/cand comparison, and that each captured
step carries the recorded absences.
"""

from __future__ import annotations

from pathlib import Path
import sys
import types

ROOT = Path(__file__).resolve().parents[4]
for part in ("scripts/equivalence", "scripts/equivalence/frontend"):
    sys.path.insert(0, str(ROOT / part))

from journeys import common  # noqa: E402


class FakeLocator:
    def __init__(self, count):
        self._count = count
        self.clicked = 0

    def count(self):
        return self._count

    def first(self):
        return self


class FakePage:
    def __init__(self, selector, present=True):
        self.locator_result = FakeLocator(1 if present else 0)
        self.selector = selector

    def locator(self, selector):
        assert selector == self.selector
        return self.locator_result


def test_required_click_fails_when_selector_is_absent():
    page = FakePage("[id^='team-']", present=False)
    try:
        common.required_click(page, "[id^='team-']")
    except LookupError as error:
        assert "[id^='team-']" in str(error)
    else:
        raise AssertionError("an absent required selector must fail")
    present = FakePage("[id^='team-']")
    common.required_click(present, "[id^='team-']")
    assert present.locator_result.clicked == 1


def test_optional_click_records_absence_instead_of_faking_a_click():
    absent = []
    common.optional_click(FakePage("Fortsetzen", present=False), "Fortsetzen", absent)
    assert absent == ["Fortsetzen"]

    page = FakePage("Fortsetzen")
    common.optional_click(page, "Fortsetzen", absent)
    assert page.locator_result.clicked == 1
    assert absent == ["Fortsetzen"]


def test_run_steps_records_each_steps_absent_selectors():
    calls = []

    def action(page, absent):
        absent.append("optional-target")

    class Page:
        def route(self, *args, **kwargs):
            calls.append("route")

        def on(self, *args, **kwargs):
            calls.append("on")

        def goto(self, path, wait_until=None):
            calls.append(path)

        def evaluate(self, script):
            return "text"

        def locator(self, selector):
            return types.SimpleNamespace(aria_snapshot=lambda: "aria")

        def wait_for_timeout(self, ms):
            pass

        def close(self):
            calls.append("close")

    context = types.SimpleNamespace(new_page=lambda: Page())
    steps, skipped = {}, []
    common.run_steps(
        context,
        "/scorecard/v2/",
        steps,
        skipped,
        actions=[("optional-step", action)],
    )
    assert steps["open"]["absent"] == []
    assert steps["optional-step"]["absent"] == ["optional-target"]
    assert skipped == []
    assert "close" in calls
