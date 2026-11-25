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
HOOK_REQUIREMENTS: dict[str, tuple[str, ...]] = {}


def register(name, impl, owner):
    """Register (or replace) the implementation for a hook."""
    _IMPLEMENTATIONS[name] = (impl, owner)
    _OWNERS[name] = owner


def is_registered(name):
    return name in _IMPLEMENTATIONS


def get(name):
    """Return the implementation or fail with an actionable message."""
    if name not in _IMPLEMENTATIONS:
        raise ImproperlyConfigured(
            f"Hook '{name}' (owner: {_OWNERS.get(name, 'a consumer app')}) "
            "is not registered. "
            "Check that the owning app is in INSTALLED_APPS and that its "
            "AppConfig.ready() calls register()."
        )
    return _IMPLEMENTATIONS[name][0]


def names():
    return tuple(sorted(_IMPLEMENTATIONS))


def reset():
    """Clear the registry (tests only)."""
    _IMPLEMENTATIONS.clear()
