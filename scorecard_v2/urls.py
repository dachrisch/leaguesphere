from django.urls import path

from scorecard_v2.views import ScorecardV2View

urlpatterns = [path("", ScorecardV2View.as_view(), name="scorecard-v2-home")]
