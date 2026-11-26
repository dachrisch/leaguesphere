"""Tests for the officials detail contributor (Phase 1, #2537)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from officials.service import gamedays_hooks as hooks


def _draft(user):
    return SimpleNamespace(
        request=SimpleNamespace(user=user),
        gameday=SimpleNamespace(pk=1),
        qualify_table={"ref": 1},
        officials=None,
        url_pattern_official="initial",
        url_pattern_official_signup="initial",
        allow_officials_to_register=None,
    )


@pytest.mark.parametrize(
    "user,expected",
    [
        (SimpleNamespace(is_staff=True, username=""), "staff"),
        (SimpleNamespace(is_staff=False, username="ref"), "member"),
        (SimpleNamespace(is_staff=False, username=""), "anon"),
    ],
)
def test_detail_contributor_resolves_names(user, expected):
    draft = _draft(user)
    with (
        patch(
            "officials.service.gamedays_hooks.OfficialSignupService.get_signed_up_officials",
            return_value=["A"],
        ) as signups,
        patch(
            "officials.service.gamedays_hooks.UrlService.build_absolute_url",
            return_value="absolute",
        ),
    ):
        hooks.detail_contributor(draft)
    assert draft.officials == ["A"]
    assert draft.url_pattern_official_signup == "absolute"
    show = signups.call_args.args[1]
    assert show is {"staff": True, "member": True, "anon": False}[expected]


def test_detail_contributor_handles_unhashable_qualify_table():
    draft = _draft(SimpleNamespace(is_staff=False, username="ref"))
    draft.qualify_table = None
    with (
        patch(
            "officials.service.gamedays_hooks.OfficialSignupService.get_signed_up_officials",
            return_value=[],
        ),
        patch(
            "officials.service.gamedays_hooks.UrlService.build_absolute_url",
            return_value="absolute",
        ),
    ):
        hooks.detail_contributor(draft)
    assert draft.officials == []


def test_detail_contributor_clears_when_registration_denied():
    draft = _draft(SimpleNamespace(is_staff=True, username=""))
    draft.allow_officials_to_register = False
    with (
        patch(
            "officials.service.gamedays_hooks.OfficialSignupService.get_signed_up_officials",
            return_value=["A"],
        ),
        patch(
            "officials.service.gamedays_hooks.UrlService.build_absolute_url",
            return_value="absolute",
        ),
    ):
        hooks.detail_contributor(draft)
    assert draft.officials == []
    assert draft.url_pattern_official == ""
    assert draft.url_pattern_official_signup == ""
