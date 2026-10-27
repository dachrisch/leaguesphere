from django.urls import path

from scorecard_v2.views import ScorecardV2View, ServiceWorkerView

urlpatterns = [
    path("", ScorecardV2View.as_view(), name="scorecard-v2-home"),
    # Served from the app scope so the worker controls /scorecard/v2/ and
    # nothing else. Anonymous on purpose — see ServiceWorkerView.
    path("sw.js", ServiceWorkerView.as_view(), name="scorecard-v2-sw"),
]
