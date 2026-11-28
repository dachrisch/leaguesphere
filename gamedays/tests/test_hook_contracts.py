"""Hook contracts: a registered implementation must accept the call gamedays makes.

The accessor modules (``gamedays/service/*_hooks.py``) are the contract: each
calls ``get("<hook>")(...)`` with a fixed shape. ``phase1.E002`` fails startup
when an implementation's signature cannot take that call, instead of a
TypeError on the first request (architecture scan 2026-11-28, B6).
"""

from __future__ import annotations

import pytest

from gamedays import checks
from gamedays.service import registry as hooks


@pytest.fixture()
def saved_registry():
    saved = dict(hooks._IMPLEMENTATIONS)
    saved_owners = dict(hooks._OWNERS)
    yield
    hooks._IMPLEMENTATIONS.clear()
    hooks._IMPLEMENTATIONS.update(saved)
    hooks._OWNERS.clear()
    hooks._OWNERS.update(saved_owners)


def test_every_required_hook_has_a_call_shape():
    shapes = checks.hook_call_shapes()
    required = {hook for names in hooks.HOOK_REQUIREMENTS.values() for hook in names}
    assert required <= set(shapes)


def test_call_shapes_are_read_from_the_accessors():
    shapes = checks.hook_call_shapes()
    assert shapes["today_statuses"] == (0, ())
    assert shapes["roster_rows"] == (3, ())
    assert shapes["update_rules_for_template"] == (1, ("pre_finished",))


def test_the_installed_apps_satisfy_every_contract():
    assert checks.check_hook_contracts() == []


def test_a_mismatched_implementation_is_reported(saved_registry):
    hooks._IMPLEMENTATIONS["roster_rows"] = (lambda gameday_id: [], "passcheck")
    errors = checks.check_hook_contracts()
    assert [error.id for error in errors] == ["phase1.E002"]
    assert "roster_rows" in errors[0].msg
    assert "passcheck" in errors[0].msg


def test_a_missing_keyword_is_reported(saved_registry):
    hooks._IMPLEMENTATIONS["update_rules_for_template"] = (
        lambda template: [],
        "gameday_designer",
    )
    errors = checks.check_hook_contracts()
    assert [error.id for error in errors] == ["phase1.E002"]


def test_unregistered_hooks_are_left_to_e001(saved_registry):
    hooks._IMPLEMENTATIONS.pop("roster_rows")
    assert checks.check_hook_contracts() == []


def test_a_builtin_without_a_signature_is_skipped(saved_registry):
    hooks._IMPLEMENTATIONS["today_statuses"] = (dict, "liveticker")
    hooks._IMPLEMENTATIONS["live_feed"] = (max, "liveticker")
    assert checks.check_hook_contracts() == []


@pytest.mark.parametrize(
    "source, expected",
    [
        ('get("hook")(1)', "hook"),
        ("other(1)", None),
        ('other("hook")(1)', None),
        ("get()(1)", None),
        ("get(name)(1)", None),
        ('obj.get("hook")(1)', None),
    ],
)
def test_only_literal_registry_get_calls_count(source, expected):
    import ast

    call = ast.parse(source, mode="eval").body
    assert checks._get_call_name(call) == expected
