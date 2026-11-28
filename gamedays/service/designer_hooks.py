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


# --- designer canvas (architecture scan 2026-11-28, N3) -------------------
# The canvas schema (GamedayDesignerState.state_data nodes) is the designer's
# concern; gamedays orchestrates publish/result/finalise and asks through
# these hooks.


class AutoAssignOfficialsError(Exception):
    """Raised by the designer's auto-assign hook; gamedays maps it to a 400."""


def canvas_progression(gameinfo):
    """Advance the canvas bracket after ``gameinfo`` finished."""
    return get("canvas_progression")(gameinfo)


def validate_canvas_progression(gameday):
    """Issues (``code``, ``message``, ``node_ids``) blocking a publish."""
    return get("validate_canvas_progression")(gameday)


def publish_canvas(gameday):
    """Materialise the canvas into Gameinfo/Gameresult rows."""
    return get("publish_canvas")(gameday)


def auto_assign_officials(gameday_id):
    """Assignments made; raises ``AutoAssignOfficialsError``."""
    return get("auto_assign_officials")(gameday_id)


def sync_canvas_node_scores(game, halftime_score, final_score):
    """Mirror a game result into its canvas node."""
    return get("sync_canvas_node_scores")(game, halftime_score, final_score)
