"""gameday_designer implementations of gamedays hooks (Phase 1, #2537).

Registered from ``GamedayDesignerConfig.ready()``. Slot and rule objects are
duck-typed across the registry: gamedays keeps its pandas/placeholder
orchestration, this module owns all designer-model reads.
"""

from __future__ import annotations

import logging

from gameday_designer.models import (
    ScheduleTemplate,
    TemplateApplication,
    TemplateSlot,
    TemplateUpdateRule,
)
from gamedays.service import registry
from gamedays.service.schedule_resolution_service import (
    GamedayScheduleResolutionService,
)
from gamedays.service.schedule_strategies import register as register_strategy

logger = logging.getLogger(__name__)


def template_for_gameday(gameday):
    application = TemplateApplication.objects.filter(gameday=gameday).first()
    if application:
        return application.template
    template_name = f"schedule_{gameday.format}"
    logger.info(
        "No TemplateApplication found for gameday %s; "
        "falling back to format-name lookup: '%s'",
        gameday.pk,
        template_name,
    )
    template = ScheduleTemplate.objects.filter(name=template_name).first()
    if template:
        logger.info(
            "Gameday %s matched template by format name '%s' "
            "(no TemplateApplication record). Consider creating one.",
            gameday.pk,
            template_name,
        )
    return template


def slots_for_template(template):
    return list(
        TemplateSlot.objects.filter(template=template).order_by("field", "slot_order")
    )


def update_rules_for_template(template, pre_finished=None):
    # Keep the old meaning of pre_finished=None: the original query filtered
    # on it (IS NULL), so it matched no rule. All callers pass a real stage.
    return list(
        TemplateUpdateRule.objects.filter(template=template, pre_finished=pre_finished)
    )


def update_rule_for_slot(slot):
    return TemplateUpdateRule.objects.filter(slot=slot).first()


def has_template_application(gameday):
    return TemplateApplication.objects.filter(gameday=gameday).exists()


def strategy_applies(instance):
    # The predicate is a required hook, so an installed designer without it
    # fails phase1.E001 at check time and fails loudly here at call time.
    return registry.get("has_template_application")(instance.gameday)


def strategy_resolve(instance):
    service = GamedayScheduleResolutionService(instance.gameday_id)
    if service.gmw.is_finished(instance.standing):
        service.update_participants(instance.standing)
    if service.gmw.is_finished(instance.stage):
        service.update_participants(instance.stage)


def register():
    registry.register("template_for_gameday", template_for_gameday, "gameday_designer")
    registry.register("slots_for_template", slots_for_template, "gameday_designer")
    registry.register(
        "update_rules_for_template", update_rules_for_template, "gameday_designer"
    )
    registry.register("update_rule_for_slot", update_rule_for_slot, "gameday_designer")
    registry.register(
        "has_template_application", has_template_application, "gameday_designer"
    )
    register_strategy(10, "designer-template", strategy_applies, strategy_resolve)
