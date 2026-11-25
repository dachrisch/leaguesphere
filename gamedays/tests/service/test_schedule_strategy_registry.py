"""Tests for the ordered schedule strategy registry (Phase 1, #2537)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from gamedays.service import schedule_strategies


@pytest.fixture()
def strategies():
    saved = dict(schedule_strategies._STRATEGIES)
    schedule_strategies._STRATEGIES.clear()
    yield
    schedule_strategies._STRATEGIES.clear()
    schedule_strategies._STRATEGIES.update(saved)


def _instance(status="beendet"):
    return SimpleNamespace(
        pk=42,
        gameday_id=7,
        gameday=SimpleNamespace(format="6_2"),
        standing="Gruppe 1",
        stage="Vorrunde",
        status=status,
    )


def test_first_matching_strategy_wins(strategies):
    calls = []
    schedule_strategies.register(
        30, "legacy", lambda gi: True, lambda gi: calls.append("legacy")
    )
    schedule_strategies.register(
        10, "designer", lambda gi: True, lambda gi: calls.append("designer")
    )
    schedule_strategies.register(
        20, "canvas", lambda gi: False, lambda gi: calls.append("canvas")
    )

    assert schedule_strategies.resolve(_instance()) == "designer"
    assert calls == ["designer"]


def test_no_matching_strategy_returns_none(strategies):
    schedule_strategies.register(10, "none", lambda gi: False, lambda gi: None)
    assert schedule_strategies.resolve(_instance()) is None


def test_failing_resolver_is_logged_and_does_not_raise(strategies, caplog):
    def explode(instance):
        raise RuntimeError("boom")

    schedule_strategies.register(10, "designer-template", lambda gi: True, explode)

    with caplog.at_level("ERROR", logger="gamedays.service.schedule_strategies"):
        assert schedule_strategies.resolve(_instance()) == "designer-template"

    message = caplog.text
    assert "designer-template" in message
    assert "42" in message
    assert "RuntimeError" in message


def test_re_registration_replaces_the_same_name(strategies):
    first = MagicMock()
    second = MagicMock()
    schedule_strategies.register(10, "designer", lambda gi: True, first)
    schedule_strategies.register(10, "designer", lambda gi: True, second)

    schedule_strategies.resolve(_instance())

    first.assert_not_called()
    second.assert_called_once()


def test_builtins_fall_back_to_legacy(strategies):
    schedule_strategies.register_builtins()
    with patch("gamedays.service.schedule_strategies.GamedayDesignerState") as state:
        state.objects.filter.return_value.exists.return_value = False
        with patch("gamedays.service.schedule_strategies.ScheduleUpdate") as update:
            assert schedule_strategies.resolve(_instance()) == "legacy"
            update.assert_called_once()
