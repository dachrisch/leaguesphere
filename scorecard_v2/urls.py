from django.urls import path

from scorecard_v2.views import ScorecardV2View, ServiceWorkerView

urlpatterns = [
    path("", ScorecardV2View.as_view(), name="scorecard-v2-home"),
    # The address of a gameday and of one of its games. English segments, and
    # the gameday is part of the game's path, so a link says where it belongs:
    # /scorecard/v2/gameday/<gameday>/game/<game>/. The SPA reads the ids from
    # the path; the view is the same app shell, so a reload works.
    path(
        "gameday/<int:gameday_pk>/",
        ScorecardV2View.as_view(),
        name="scorecard-v2-gameday",
    ),
    path(
        "gameday/<int:gameday_pk>/game/<int:pk>/",
        ScorecardV2View.as_view(),
        name="scorecard-v2-gameday-game",
    ),
    # The first address a game had; links already handed out keep working.
    # The app rewrites the address to the gameday path once it knows it.
    path(
        "spiel/<int:pk>/",
        ScorecardV2View.as_view(),
        name="scorecard-v2-game",
    ),
    # Served from the app scope so the worker controls /scorecard/v2/ and
    # nothing else. Anonymous on purpose — see ServiceWorkerView.
    path("sw.js", ServiceWorkerView.as_view(), name="scorecard-v2-sw"),
]
