"""Startup checks for Phase 1 hook registration (dachrisch/leaguesphere#2537).

Registered in ``GamedaysConfig.ready()``. A deployment missing a consumer hook
fails at startup instead of silently taking a fallback at request time.
"""

from __future__ import annotations

from django.apps import apps
from django.core.checks import Error, register

from gamedays.service import registry


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
