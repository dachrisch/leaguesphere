"""
Permissions for gameday_designer app.

Following TDD methodology (GREEN phase) - implementing permissions to pass tests.
Handles template access control based on user roles and associations.
"""

from rest_framework import permissions
from gameday_designer.models import ScheduleTemplate




class IsStaffOrReadOnly(permissions.BasePermission):
    """Read for any authenticated user; write requires staff."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return bool(request.user and request.user.is_staff)

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_staff)
