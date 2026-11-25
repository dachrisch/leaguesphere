"""Gamedays-side access points for gameday_designer-provided hooks (Phase 1, #2537).

The implementations live in ``gameday_designer/service/gamedays_hooks.py`` and
are registered from that app's ``AppConfig.ready()``. Calling an unregistered
hook raises ``ImproperlyConfigured`` rather than silently changing behaviour.
"""

from __future__ import annotations

from gamedays.service.registry import get


def template_for_gameday(gameday):
    return get("template_for_gameday")(gameday)


def slots_for_template(template):
    return get("slots_for_template")(template)


def update_rules_for_template(template, pre_finished=None):
    return get("update_rules_for_template")(template, pre_finished=pre_finished)


def update_rule_for_slot(slot):
    return get("update_rule_for_slot")(slot)


def has_template_application(gameday):
    return get("has_template_application")(gameday)
