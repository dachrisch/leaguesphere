from django.urls import path

from scorecard_v2.views import ScorecardV2View, ServiceWorkerView

urlpatterns = [
    path("", ScorecardV2View.as_view(), name="scorecard-v2-home"),
    # A game's own address: /scorecard/v2/spiel/<id>/ (the deep link the
    # organisation keeps). The SPA reads the id from the path; the view is the
    # same app shell, so a reload of the link works.
    path(
        "spiel/<int:pk>/",
        ScorecardV2View.as_view(),
        name="scorecard-v2-game",
    ),
    # Served from the app scope so the worker controls /scorecard/v2/ and
    # nothing else. Anonymous on purpose — see ServiceWorkerView.
    path("sw.js", ServiceWorkerView.as_view(), name="scorecard-v2-sw"),
]
