from django.contrib.auth.models import User
from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAuthenticatedOrOwnerOrStaff(BasePermission):
    """
    Permission for objects with a direct `author` ForeignKey (e.g. Gameday).

    - SAFE_METHODS (GET, HEAD, OPTIONS): AllowAny
    - Other methods: requires authentication AND (user.is_staff OR obj.author == user)
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return request.user.is_staff or obj.author == request.user


class IsAuthenticatedOrGamedayOwnerOrStaff(BasePermission):
    """
    Permission for objects linked through a `gameday` ForeignKey
    (e.g. Gameinfo, GameOfficial, Gameresult).

    - SAFE_METHODS: AllowAny
    - Other methods: requires authentication AND
      (user.is_staff OR obj.gameday.author == user)

    Handles both direct `.gameday` FK and indirect `.gameinfo.gameday` FK.
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True

        gameday = getattr(obj, "gameday", None)
        if gameday is None:
            gameinfo = getattr(obj, "gameinfo", None)
            if gameinfo is not None:
                gameday = getattr(gameinfo, "gameday", None)

        if gameday is None:
            return False

        return request.user.is_staff or gameday.author == request.user
