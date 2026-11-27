"""Ordered schedule-resolution strategies (Phase 1, #2537).

Replaces the branching in ``signals.py`` with an explicit, ordered registry:
designer template (10) → canvas (20) → legacy (30). The first matching
strategy wins. A failing strategy is logged with its name and the gameinfo
id and finalisation still succeeds; there is deliberately no in-process
counter.
"""

from __future__ import annotations

import logging

from gamedays.management.schedule_update import ScheduleUpdate
from gamedays.models import GamedayDesignerState
from gamedays.service.canvas_progression_service import CanvasBracketProgressionService

logger = logging.getLogger(__name__)

_STRATEGIES: dict[str, tuple] = {}


def register(order, name, applies, resolver):
    """Register (or replace) a strategy; lower `order` wins."""
    _STRATEGIES[name] = (order, applies, resolver)


def register_builtins():
    register(
        20,
        "canvas",
        lambda instance: GamedayDesignerState.objects.filter(
            gameday=instance.gameday
        ).exists(),
        lambda instance: CanvasBracketProgressionService(instance).apply(),
    )
    register(
        30,
        "legacy",
        lambda instance: True,
        lambda instance: ScheduleUpdate(
            instance.gameday_id, instance.gameday.format
        ).update(),
    )


def resolve(instance):
    """Run the first applicable strategy; return its name or ``None``.

    Both the predicate and the resolver run inside the failure guard: the old
    signal had its existence checks inside the broad ``except`` too, so a DB
    error or a raising predicate was logged while finalisation succeeded.
    """
    for name, (order, applies, resolver) in sorted(
        _STRATEGIES.items(), key=lambda item: item[1][0]
    ):
        try:
            matched = applies(instance)
        except Exception:
            logger.exception(
                "schedule resolution failed strategy=%s gameinfo=%s",
                name,
                instance.pk,
            )
            return None
        if not matched:
            continue
        try:
            resolver(instance)
        except Exception:
            logger.exception(
                "schedule resolution failed strategy=%s gameinfo=%s",
                name,
                instance.pk,
            )
        return name
    return None


register_builtins()
