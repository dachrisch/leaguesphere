"""The designer-template strategy is backed by a required registered hook."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.core.exceptions import ImproperlyConfigured

from gamedays.service import registry


@pytest.fixture()
def hook_registered():
    """The app's ready() hook is registered during normal Django startup."""
    assert registry.is_registered("has_template_application")
    yield


def _instance():
    return SimpleNamespace(gameday=SimpleNamespace(pk=7))


def test_strategy_applies_uses_the_registered_hook(hook_registered):
    from gameday_designer.service import gamedays_hooks

    with patch.object(
        gamedays_hooks.registry, "get", return_value=lambda gameday: True
    ) as get:
        assert gamedays_hooks.strategy_applies(_instance()) is True
    get.assert_called_once_with("has_template_application")


def test_strategy_applies_fails_loudly_without_the_hook():
    from gameday_designer.service import gamedays_hooks

    saved = dict(registry._IMPLEMENTATIONS)
    saved_owners = dict(registry._OWNERS)
    registry.reset()
    try:
        with pytest.raises(ImproperlyConfigured) as error:
            gamedays_hooks.strategy_applies(_instance())
        assert "has_template_application" in str(error.value)
    finally:
        registry._IMPLEMENTATIONS.update(saved)
        registry._OWNERS.update(saved_owners)
