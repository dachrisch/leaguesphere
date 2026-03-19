from unittest.mock import MagicMock

from django.contrib.auth.models import AnonymousUser
from django.test import SimpleTestCase, TestCase

from gamedays.models import Team
from league_manager.utils.view_utils import PermissionHelper, is_finance_admin


class PermissionHelperTests(TestCase):
    def test_has_staff_or_user_permission_for_staff(self):
        mock_user = MagicMock(is_staff=True, username="staff_user")
        mock_request = MagicMock(user=mock_user)

        result = PermissionHelper.has_staff_or_user_permission(mock_request)
        self.assertTrue(result, "The user is staff, so the permission should be True")

    def test_has_staff_or_user_permission_for_user(self):
        mock_user = MagicMock(is_staff=False, username="regular_user")
        mock_request = MagicMock(user=mock_user)

        with self.subTest("Team exists"):
            Team.objects.get = MagicMock(return_value=Team(name="regular_user"))
            result = PermissionHelper.has_staff_or_user_permission(mock_request)
            self.assertTrue(
                result,
                "The user's username matches the team's name, so the permission should be True",
            )

        with self.subTest("Team does not exist"):
            Team.objects.get = MagicMock(side_effect=Team.DoesNotExist())
            result = PermissionHelper.has_staff_or_user_permission(mock_request)
            self.assertFalse(
                result,
                "The user is not staff, and the team does not exist, so the permission should be False",
            )
        # if mock isn't deleted explicitly it will stay active for all the other tests and some will fail
        del Team.objects.get


class IsFinanceAdminTests(SimpleTestCase):
    def _make_staff(self, email):
        user = MagicMock(is_staff=True, email=email)
        return user

    def test_staff_with_bumbleflies_email_is_finance_admin(self):
        user = self._make_staff('admin@bumbleflies.de')
        self.assertTrue(is_finance_admin(user))

    def test_staff_with_other_email_is_not_finance_admin(self):
        user = self._make_staff('admin@other.de')
        self.assertFalse(is_finance_admin(user))

    def test_staff_with_subdomain_email_is_not_finance_admin(self):
        # user@sub.bumbleflies.de ends with '.bumbleflies.de', not '@bumbleflies.de'
        user = self._make_staff('admin@sub.bumbleflies.de')
        self.assertFalse(is_finance_admin(user))

    def test_non_staff_with_bumbleflies_email_is_not_finance_admin(self):
        user = MagicMock(is_staff=False, email='user@bumbleflies.de')
        self.assertFalse(is_finance_admin(user))

    def test_anonymous_user_is_not_finance_admin(self):
        self.assertFalse(is_finance_admin(AnonymousUser()))

    def test_staff_with_none_email_is_not_finance_admin(self):
        user = self._make_staff(None)
        self.assertFalse(is_finance_admin(user))
