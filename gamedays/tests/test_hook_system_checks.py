"""Phase 1 hook registry and Django system check (dachrisch/leaguesphere#2537).

The registry is the single place consumer apps register their implementations.
These tests pin idempotence, loud failures for unregistered hooks, and the
startup system check that stops a deployment with a missing hook.
"""

from __future__ import annotations

import pytest
from django.apps import apps
from django.core.checks import Error, run_checks
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command

from gamedays.service import registry as hooks


@pytest.fixture()
def clean_registry():
    saved = dict(hooks._IMPLEMENTATIONS)
    saved_owners = dict(hooks._OWNERS)
    saved_requirements = dict(hooks.HOOK_REQUIREMENTS)
    hooks.reset()
    yield
    hooks._IMPLEMENTATIONS.clear()
    hooks._IMPLEMENTATIONS.update(saved)
    hooks._OWNERS.clear()
    hooks._OWNERS.update(saved_owners)
    hooks.HOOK_REQUIREMENTS.clear()
    hooks.HOOK_REQUIREMENTS.update(saved_requirements)


def test_missing_hook_raises_with_owner_from_requirements(clean_registry, monkeypatch):
    """reset() drops _OWNERS too, so the owner comes from HOOK_REQUIREMENTS."""
    monkeypatch.setattr(
        hooks,
        "HOOK_REQUIREMENTS",
        {"passcheck": ("other_hook",), "league_table": ("season_settings",)},
    )
    hooks.register("season_settings", lambda: 1, "league_table")
    hooks.reset()
    assert hooks._OWNERS == {}
    with pytest.raises(ImproperlyConfigured) as error:
        hooks.get("season_settings")
    message = str(error.value)
    assert "season_settings" in message
    assert "league_table" in message
    assert "INSTALLED_APPS" in message


def test_missing_hook_without_requirement_says_consumer_app(clean_registry):
    with pytest.raises(ImproperlyConfigured) as error:
        hooks.get("never_registered")
    assert "a consumer app" in str(error.value)


def test_is_registered_false_for_unknown(clean_registry):
    assert hooks.is_registered("never_registered") is False


def test_register_twice_replaces_and_preserves_identity(clean_registry):
    first = lambda: 1  # noqa: E731  (identity is the point of this test)
    second = lambda: 2  # noqa: E731
    hooks.register("hook", first, "league_table")
    hooks.register("hook", second, "league_table")
    assert hooks.get("hook") is second
    assert hooks.names() == ("hook",)


def test_register_different_owner_raises(clean_registry):
    """A second owner must not silently replace another app's hook."""
    first = lambda: 1  # noqa: E731
    second = lambda: 2  # noqa: E731
    hooks.register("hook", first, "league_table")
    with pytest.raises(ImproperlyConfigured) as error:
        hooks.register("hook", second, "passcheck")
    message = str(error.value)
    assert "league_table" in message and "passcheck" in message
    assert hooks.get("hook") is first
    assert hooks._OWNERS["hook"] == "league_table"


def test_names_is_sorted_and_reset_clears(clean_registry):
    hooks.register("z_hook", lambda: 1, "league_table")
    hooks.register("a_hook", lambda: 2, "passcheck")
    assert hooks.names() == ("a_hook", "z_hook")
    hooks.reset()
    assert hooks.names() == ()


@pytest.mark.django_db
def test_system_check_reports_missing_hook(clean_registry, monkeypatch):
    monkeypatch.setattr(
        hooks, "HOOK_REQUIREMENTS", {"league_table": ("season_settings",)}
    )
    assert apps.is_installed("league_table")
    call_command("check", fail_level="CRITICAL")
    errors = [
        error for error in run_checks() if getattr(error, "id", None) == "phase1.E001"
    ]
    assert errors
    assert any("league_table" in str(error) for error in errors)
    assert any("season_settings" in str(error) for error in errors)


@pytest.mark.django_db
def test_system_check_silent_when_hook_registered(clean_registry, monkeypatch):
    monkeypatch.setattr(
        hooks, "HOOK_REQUIREMENTS", {"league_table": ("season_settings",)}
    )
    hooks.register("season_settings", lambda: 1, "league_table")
    call_command("check", fail_level="CRITICAL")
    errors = [
        error for error in run_checks() if getattr(error, "id", None) == "phase1.E001"
    ]
    assert errors == []


@pytest.mark.django_db
def test_system_check_ignores_apps_not_installed(clean_registry, monkeypatch):
    monkeypatch.setattr(hooks, "HOOK_REQUIREMENTS", {"not_installed_app": ("hook",)})
    call_command("check", fail_level="CRITICAL")
    errors = [
        error for error in run_checks() if getattr(error, "id", None) == "phase1.E001"
    ]
    assert errors == []


def test_ready_twice_does_not_double_register(clean_registry):
    from django.apps import AppConfig

    class ConsumerConfig(AppConfig):
        name = "league_table"

        def ready(self):
            hooks.register("season_settings", lambda: 1, "league_table")

    config = ConsumerConfig("league_table", __import__("league_table"))
    config.ready()
    config.ready()
    assert hooks.names() == ("season_settings",)
