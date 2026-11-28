"""Startup checks for Phase 1 hook registration (dachrisch/leaguesphere#2537).

Registered in ``GamedaysConfig.ready()``. A deployment missing a consumer hook
is caught by ``manage.py check`` in CI and by ``migrate`` on deploy — system
checks do not run under gunicorn, so this is not a request-time guard.
"""

from __future__ import annotations

import ast
import inspect
from functools import lru_cache
from importlib import import_module

from django.apps import apps
from django.core.checks import Error, register

from gamedays.service import registry

# The accessor modules: the only callers of registry.get(). The call each one
# makes is the hook's contract.
ACCESSOR_MODULES = (
    "gamedays.service.designer_hooks",
    "gamedays.service.league_group_hooks",
    "gamedays.service.league_table_hooks",
    "gamedays.service.liveticker_hooks",
    "gamedays.service.officials_hooks",
    "gamedays.service.passcheck_hooks",
)
# Hooks called somewhere else: detail_signups is a detail-page contributor,
# run by detail_context.build() as contributor(draft).
EXTRA_CALL_SHAPES = {"detail_signups": (1, ())}


@register()
def check_consumer_hooks(app_configs=None, **kwargs):
    errors = []
    for app, hooks in registry.HOOK_REQUIREMENTS.items():
        if not apps.is_installed(app):
            continue
        for hook in hooks:
            if registry.is_registered(hook):
                continue
            errors.append(
                Error(
                    f"Consumer app '{app}' has not registered required hook '{hook}'.",
                    hint=(
                        f"Call register() from {app}/service/gamedays_hooks.py "
                        "in AppConfig.ready()."
                    ),
                    id="phase1.E001",
                )
            )
    return errors


def _get_call_name(node) -> str | None:
    """``"x"`` for a ``get("x")(...)`` call node, else ``None``."""
    inner = node.func
    if not (isinstance(inner, ast.Call) and isinstance(inner.func, ast.Name)):
        return None
    if inner.func.id != "get" or not inner.args:
        return None
    first = inner.args[0]
    return first.value if isinstance(first, ast.Constant) else None


@lru_cache(maxsize=1)
def hook_call_shapes() -> dict[str, tuple[int, tuple[str, ...]]]:
    """Hook name -> (positional count, keyword names) as gamedays calls it."""
    shapes = dict(EXTRA_CALL_SHAPES)
    for module_name in ACCESSOR_MODULES:
        tree = ast.parse(inspect.getsource(import_module(module_name)))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            name = _get_call_name(node)
            if name is not None:
                keywords = tuple(keyword.arg for keyword in node.keywords)
                shapes[name] = (len(node.args), keywords)
    return shapes


@register()
def check_hook_contracts(app_configs=None, **kwargs):
    """Every registered hook must accept the call its accessor makes."""
    errors = []
    for hook, (positional, keywords) in sorted(hook_call_shapes().items()):
        if not registry.is_registered(hook):
            continue  # phase1.E001's job
        impl, owner = registry._IMPLEMENTATIONS[hook]
        try:
            signature = inspect.signature(impl)
        except (TypeError, ValueError):
            continue  # a builtin without introspectable signature
        try:
            signature.bind(*([None] * positional), **{key: None for key in keywords})
        except TypeError as error:
            errors.append(
                Error(
                    f"Hook '{hook}' registered by '{owner}' cannot accept the call "
                    f"gamedays makes ({positional} positional, keywords "
                    f"{list(keywords)}): {error}.",
                    hint=(
                        f"Match the signature of {hook}() in "
                        "gamedays/service/*_hooks.py."
                    ),
                    id="phase1.E002",
                )
            )
    return errors
