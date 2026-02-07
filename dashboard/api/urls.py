from django.urls import path
from dashboard.api.views import (
    DashboardSummaryAPIView,
    LiveGamesAPIView,
    LeagueStatsAPIView,
    SeasonStatsAPIView,
    AssociationStatsAPIView,
)

urlpatterns = [
    path("summary/", DashboardSummaryAPIView.as_view(), name="dashboard-summary"),
    path("live-games/", LiveGamesAPIView.as_view(), name="dashboard-live-games"),
    path("league/<int:league_id>/stats/", LeagueStatsAPIView.as_view(), name="league-stats"),
    path("season/<int:season_id>/stats/", SeasonStatsAPIView.as_view(), name="season-stats"),
    path("association/<int:association_id>/stats/", AssociationStatsAPIView.as_view(), name="association-stats"),
]
