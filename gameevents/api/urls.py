"""API routes of the event store (mounted under ``/api/``)."""

from django.urls import path

from gameevents.api.views import GameEventsAPIView

urlpatterns = [
    path(
        "game/<int:game_id>/events",
        GameEventsAPIView.as_view(),
        name="api-game-events",
    ),
]
