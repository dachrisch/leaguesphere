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
    UsersPerTeamAPIView,
    AdminStatsAPIView,
    LeagueHierarchyAPIView,
    GamesPerLeagueAPIView,
    TeamsPerLeagueAPIView,
    TeamsPerAssociationAPIView,
    RefereesPerTeamAPIView,
)

urlpatterns = [
    # Admin Dashboard Endpoints
    path("admin-stats/", AdminStatsAPIView.as_view(), name="admin-stats"),
    path(
        "league-hierarchy/",
        LeagueHierarchyAPIView.as_view(),
        name="league-hierarchy",
    ),
    path("games-per-league/", GamesPerLeagueAPIView.as_view(), name="games-per-league"),
    path("teams-per-league/", TeamsPerLeagueAPIView.as_view(), name="teams-per-league"),
    path(
        "teams-per-association/",
        TeamsPerAssociationAPIView.as_view(),
        name="teams-per-association",
    ),
    path(
        "referees-per-team/",
        RefereesPerTeamAPIView.as_view(),
        name="referees-per-team",
    ),
    # Legacy endpoints (keep existing)
    path("summary/", DashboardSummaryAPIView.as_view(), name="dashboard-summary"),
    path("live-games/", LiveGamesAPIView.as_view(), name="dashboard-live-games"),
    path(
        "league/<int:league_id>/stats/",
        LeagueStatsAPIView.as_view(),
        name="league-stats",
    ),
    path(
        "season/<int:season_id>/stats/",
        SeasonStatsAPIView.as_view(),
        name="season-stats",
    ),
    path(
        "association/<int:association_id>/stats/",
        AssociationStatsAPIView.as_view(),
        name="association-stats",
    ),
    # SaaS Admin Dashboard endpoints
    path("platform-health/", PlatformHealthAPIView.as_view(), name="platform-health"),
    path("recent-activity/", RecentActivityAPIView.as_view(), name="recent-activity"),
    path("online-users/", OnlineUsersAPIView.as_view(), name="online-users"),
    path(
        "content-creation/", ContentCreationAPIView.as_view(), name="content-creation"
    ),
    path("feature-usage/", FeatureUsageAPIView.as_view(), name="feature-usage"),
    path("user-segments/", UserSegmentsAPIView.as_view(), name="user-segments"),
    path("problem-alerts/", ProblemAlertsAPIView.as_view(), name="problem-alerts"),
    path("users-per-team/", UsersPerTeamAPIView.as_view(), name="users-per-team"),
]
