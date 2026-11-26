"""Tests for designer-owned gamedays hook implementations (Phase 1, #2537)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.core.exceptions import ImproperlyConfigured

from gameday_designer.models import (
    ScheduleTemplate,
    TemplateApplication,
    TemplateSlot,
    TemplateUpdateRule,
)
from gameday_designer.service import gamedays_hooks as hooks
from gamedays.models import Gameday
from gamedays.service import registry
from gamedays.tests.setup_factories.db_setup import DBSetup


@pytest.fixture()
def designer_context():
    DBSetup().g62_status_empty()
    gameday = Gameday.objects.first()
    template = ScheduleTemplate.objects.create(
        name="Hook Template", num_teams=6, num_fields=2
    )
    slot = TemplateSlot.objects.create(
        template=template,
        field=1,
        slot_order=0,
        stage="Preliminary",
        standing="Gruppe 1",
    )
    return gameday, template, slot


@pytest.mark.django_db
def test_update_rules_without_pre_finished_keeps_the_old_null_filter(designer_context):
    _, template, slot = designer_context
    TemplateUpdateRule.objects.create(
        template=template, slot=slot, pre_finished="Gruppe 1"
    )
    other_slot = TemplateSlot.objects.create(
        template=template,
        field=1,
        slot_order=1,
        stage="Preliminary",
        standing="Gruppe 2",
    )
    TemplateUpdateRule.objects.create(
        template=template, slot=other_slot, pre_finished="Gruppe 2"
    )

    # The original code filtered pre_finished=None (IS NULL), so it matched
    # no rule — do not silently turn that into "all rules".
    assert hooks.update_rules_for_template(template) == []
    assert len(hooks.update_rules_for_template(template, pre_finished="Gruppe 1")) == 1


@pytest.mark.django_db
def test_template_prefers_the_application(designer_context):
    gameday, template, _ = designer_context
    TemplateApplication.objects.create(
        gameday=gameday, template=template, team_mapping={}
    )
    other = ScheduleTemplate.objects.create(
        name=f"schedule_{gameday.format}", num_teams=6, num_fields=2
    )

    assert hooks.template_for_gameday(gameday).pk == template.pk
    assert hooks.template_for_gameday(gameday).pk != other.pk


@pytest.mark.django_db
def test_template_fallback_by_format_name(designer_context):
    gameday, _, _ = designer_context
    template = ScheduleTemplate.objects.create(
        name=f"schedule_{gameday.format}", num_teams=6, num_fields=2
    )
    assert hooks.template_for_gameday(gameday).pk == template.pk


@pytest.mark.django_db
def test_template_fallback_returns_none_without_a_match(designer_context):
    gameday, _, _ = designer_context
    assert hooks.template_for_gameday(gameday) is None


@pytest.mark.django_db
@pytest.mark.parametrize(
    "finished",
    [
        [True, True],
        [True, False],
        [False, True],
        [False, False],
    ],
)
def test_strategy_resolve_checks_standing_then_stage(designer_context, finished):
    gameday, _, _ = designer_context
    instance = SimpleNamespace(
        pk=1,
        gameday_id=gameday.pk,
        standing="Gruppe 1",
        stage="Vorrunde",
    )
    with patch(
        "gameday_designer.service.gamedays_hooks.GamedayScheduleResolutionService"
    ) as service:
        service.return_value.gmw.is_finished.side_effect = finished
        hooks.strategy_resolve(instance)
        assert service.return_value.update_participants.call_count == sum(finished)


@pytest.fixture()
def hook_registered():
    """The app's ready() hook is registered during normal Django startup."""
    assert registry.is_registered("has_template_application")
    yield


def test_strategy_applies_uses_the_required_hook(hook_registered):
    instance = SimpleNamespace(gameday=SimpleNamespace(pk=7))
    with patch.object(registry, "get", return_value=lambda gameday: True) as get:
        assert hooks.strategy_applies(instance) is True
    get.assert_called_once_with("has_template_application")


def test_strategy_applies_fails_loudly_without_the_hook():
    saved = dict(registry._IMPLEMENTATIONS)
    saved_owners = dict(registry._OWNERS)
    registry.reset()
    try:
        with pytest.raises(ImproperlyConfigured) as error:
            hooks.strategy_applies(SimpleNamespace(gameday=SimpleNamespace(pk=7)))
        assert "has_template_application" in str(error.value)
    finally:
        registry._IMPLEMENTATIONS.update(saved)
        registry._OWNERS.update(saved_owners)
