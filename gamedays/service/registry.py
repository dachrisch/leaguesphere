"""In-process registry for cross-app hook implementations (Phase 1, #2537).

`gamedays` defines the hook names; consumer apps register implementations from
their `AppConfig.ready()` (via `<app>/service/gamedays_hooks.py::register()`).
Registration is idempotent: running `ready()` twice never duplicates an entry.

An unregistered hook fails loudly: silently falling back would hide a consumer
whose `INSTALLED_APPS` entry or `ready()` registration was dropped. The only
exceptions are the two documented `is_registered()` fallbacks.
"""

from __future__ import annotations

from django.core.exceptions import ImproperlyConfigured

_IMPLEMENTATIONS: dict[str, tuple] = {}
_OWNERS: dict[str, str] = {}

# Single source of truth for the startup system check. A layer adds a hook
# here only when the consumer that implements it exists.
HOOK_REQUIREMENTS: dict[str, tuple[str, ...]] = {
    "gameday_designer": (
        "template_for_gameday",
        "slots_for_template",
        "update_rules_for_template",
        "update_rule_for_slot",
        "has_template_application",
    ),
}


def owner_for_hook(name):
    """The app that owns a hook, from the system-check requirements."""
    for app, required in HOOK_REQUIREMENTS.items():
        if name in required:
            return app
    return "a consumer app"


def register(name, impl, owner):
    """Register (or replace) the implementation for a hook.

    Only the owning app may replace an implementation; a different owner
    signals a misconfigured or conflicting AppConfig and fails loudly.
    """
    if name in _OWNERS and _OWNERS[name] != owner:
        raise ImproperlyConfigured(
            f"Hook '{name}' is owned by '{_OWNERS[name]}'; "
            f"'{owner}' cannot replace it."
        )
    _IMPLEMENTATIONS[name] = (impl, owner)
    _OWNERS[name] = owner


def is_registered(name):
    return name in _IMPLEMENTATIONS


def get(name):
    """Return the implementation or fail with an actionable message."""
    if name not in _IMPLEMENTATIONS:
        raise ImproperlyConfigured(
            f"Hook '{name}' (owner: {owner_for_hook(name)}) "
            "is not registered. "
            "Check that the owning app is in INSTALLED_APPS and that its "
            "AppConfig.ready() calls register()."
        )
    return _IMPLEMENTATIONS[name][0]


def names():
    return tuple(sorted(_IMPLEMENTATIONS))


def reset():
    """Clear the registry (tests only), including owner metadata."""
    _IMPLEMENTATIONS.clear()
    _OWNERS.clear()
