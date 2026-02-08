from django.urls import path
from dashboard.api.views import (
    DashboardSummaryAPIView,
    LiveGamesAPIView,
    LeagueStatsAPIView,
    SeasonStatsAPIView,
    AssociationStatsAPIView,
    PlatformHealthAPIView,
    RecentActivityAPIView,
    OnlineUsersAPIView,
    ContentCreationAPIView,
    FeatureUsageAPIView,
    UserSegmentsAPIView,
    ProblemAlertsAPIView,
)

urlpatterns = [
    # Legacy dashboard endpoints
    path("summary/", DashboardSummaryAPIView.as_view(), name="dashboard-summary"),
    path("live-games/", LiveGamesAPIView.as_view(), name="dashboard-live-games"),
    path("league/<int:league_id>/stats/", LeagueStatsAPIView.as_view(), name="league-stats"),
    path("season/<int:season_id>/stats/", SeasonStatsAPIView.as_view(), name="season-stats"),
    path("association/<int:association_id>/stats/", AssociationStatsAPIView.as_view(), name="association-stats"),

    # SaaS Admin Dashboard endpoints
    path("platform-health/", PlatformHealthAPIView.as_view(), name="platform-health"),
    path("recent-activity/", RecentActivityAPIView.as_view(), name="recent-activity"),
    path("online-users/", OnlineUsersAPIView.as_view(), name="online-users"),
    path("content-creation/", ContentCreationAPIView.as_view(), name="content-creation"),
    path("feature-usage/", FeatureUsageAPIView.as_view(), name="feature-usage"),
    path("user-segments/", UserSegmentsAPIView.as_view(), name="user-segments"),
    path("problem-alerts/", ProblemAlertsAPIView.as_view(), name="problem-alerts"),
]
