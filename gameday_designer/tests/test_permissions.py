"""
Tests for gameday_designer permissions.

Following TDD methodology (RED phase) - writing tests BEFORE implementation.
Tests define expected permission behavior for different user types.
"""

import pytest
from django.contrib.auth.models import User, AnonymousUser
from rest_framework.test import APIRequestFactory

from gamedays.models import Association, Gameday
from gameday_designer.models import ScheduleTemplate


@pytest.fixture
def api_factory():
    """Provide DRF APIRequestFactory."""
    return APIRequestFactory()


@pytest.fixture
def staff_user(db):
    """Create staff user."""
    return User.objects.create_user(
        username="staff", email="staff@example.com", password="password", is_staff=True
    )


@pytest.fixture
def association_user(db):
    """Create regular user."""
    return User.objects.create_user(
        username="assoc_user",
        email="assoc@example.com",
        password="password",
        is_staff=False,
    )


@pytest.fixture
def other_user(db):
    """Create another regular user."""
    return User.objects.create_user(
        username="other_user",
        email="other@example.com",
        password="password",
        is_staff=False,
    )


@pytest.fixture
def association(db):
    """Create test association."""
    return Association.objects.create(name="Test Association", abbr="TEST")


@pytest.fixture
def other_association(db):
    """Create another association."""
    return Association.objects.create(name="Other Association", abbr="OTHER")


@pytest.fixture
def association_template(db, association, association_user):
    """Create association-specific template."""
    return ScheduleTemplate.objects.create(
        name="Association Template",
        description="For TEST association",
        num_teams=6,
        num_fields=2,
        num_groups=1,
        game_duration=70,
        association=association,
        created_by=association_user,
        updated_by=association_user,
    )


@pytest.fixture
def global_template(db, staff_user):
    """Create global template."""
    return ScheduleTemplate.objects.create(
        name="Global Template",
        description="Global template",
        num_teams=8,
        num_fields=3,
        num_groups=2,
        game_duration=60,
        association=None,
        created_by=staff_user,
        updated_by=staff_user,
    )


@pytest.fixture
def gameday(db, association, staff_user):
    """Create test gameday."""
    from datetime import date, time
    from gamedays.models import Season, League

    # Create season and league first
    league = League.objects.create(name="Test League")
    season = Season.objects.create(name="2025")

    return Gameday.objects.create(
        name="Test Gameday",
        date=date(2025, 1, 15),
        start=time(10, 0),
        format="6_2",
        season=season,
        league=league,
        author=staff_user,
    )


@pytest.mark.django_db
class TestIsStaffOrReadOnly:
    """Tests for the IsStaffOrReadOnly permission."""

    def _perm(self):
        from gameday_designer.permissions import IsStaffOrReadOnly
        return IsStaffOrReadOnly()

    def test_get_allowed_for_authenticated_non_staff(self, api_factory, association_user):
        request = api_factory.get("/")
        request.user = association_user
        assert self._perm().has_permission(request, None) is True

    def test_get_denied_for_anonymous(self, api_factory):
        request = api_factory.get("/")
        request.user = AnonymousUser()
        assert self._perm().has_permission(request, None) is False

    def test_post_denied_for_non_staff(self, api_factory, association_user):
        request = api_factory.post("/")
        request.user = association_user
        assert self._perm().has_permission(request, None) is False

    def test_post_allowed_for_staff(self, api_factory, staff_user):
        request = api_factory.post("/")
        request.user = staff_user
        assert self._perm().has_permission(request, None) is True

    def test_object_write_denied_for_non_staff(self, api_factory, association_user):
        request = api_factory.delete("/")
        request.user = association_user
        assert self._perm().has_object_permission(request, None, object()) is False
