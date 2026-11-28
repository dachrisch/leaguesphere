"""PermissionHelper.get_user_request_permission with real teams."""

from types import SimpleNamespace

from django.test import TestCase

from gamedays.service.team_permission import PermissionHelper
from gamedays.tests.setup_factories.factories import TeamFactory


def _request(username, is_staff):
    return SimpleNamespace(user=SimpleNamespace(username=username, is_staff=is_staff))


class TestUserRequestPermission(TestCase):
    def test_staff_is_flagged_and_matched_against_the_team(self):
        team = TeamFactory(name="Staffers")
        permission = PermissionHelper.get_user_request_permission(
            _request("Staffers", True), team.pk
        )
        assert permission.is_staff is True
        assert permission.is_user is True

    def test_non_staff_team_account(self):
        team = TeamFactory(name="Owners")
        permission = PermissionHelper.get_user_request_permission(
            _request("Owners", False), team.pk
        )
        assert permission.is_staff is False
        assert permission.is_user is True
        assert permission.is_user_or_staff() is True

    def test_unknown_team_grants_nothing(self):
        permission = PermissionHelper.get_user_request_permission(
            _request("nobody", False), 999999
        )
        assert permission.is_user_or_staff() is False
