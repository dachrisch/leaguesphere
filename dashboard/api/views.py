from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from dashboard.service.dashboard_service import DashboardService
from dashboard.api.serializers import (
    DashboardSummarySerializer,
    LiveGameSerializer,
    LeagueStatsSerializer,
    SeasonStatsSerializer,
    AssociationStatsSerializer,
    PlatformHealthSerializer,
    RecentActionSerializer,
    OnlineUserSerializer,
    ContentCreationSerializer,
    FeatureUsageSerializer,
    UserSegmentsSerializer,
    ProblemAlertsSerializer,
    UsersPerTeamSerializer,
    AdminStatsSerializer,
    GamesPerLeagueSerializer,
    TeamsPerLeagueSerializer,
    TeamsPerAssociationSerializer,
    RefereesPerTeamSerializer,
    LeagueHierarchySerializer,
    AdminDashboardSerializer,
)


class DashboardSummaryAPIView(APIView):

    """API view for overall dashboard statistics."""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(60))  # Cache for 60 seconds
    def get(self, request):
        """Get summary statistics."""
        data = DashboardService.get_summary_stats()
        serializer = DashboardSummarySerializer(data)
        return Response(serializer.data)


class LiveGamesAPIView(APIView):
    """API view for currently active games."""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(30))  # Cache for 30 seconds
    def get(self, request):
        """Get list of live games."""
        games = DashboardService.get_live_games()
        serializer = LiveGameSerializer(games, many=True)
        return Response(serializer.data)


class LeagueStatsAPIView(APIView):
    """API view for league-specific statistics."""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(60))  # Cache for 60 seconds
    def get(self, request, league_id):
        """Get statistics for a specific league."""
        stats = DashboardService.get_stats_by_league(league_id)
        if stats is None:
            return Response({"error": "League not found"}, status=404)
        serializer = LeagueStatsSerializer(stats)
        return Response(serializer.data)


class SeasonStatsAPIView(APIView):
    """API view for season-specific statistics."""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(60))  # Cache for 60 seconds
    def get(self, request, season_id):
        """Get statistics for a specific season."""
        stats = DashboardService.get_stats_by_season(season_id)
        if stats is None:
            return Response({"error": "Season not found"}, status=404)
        serializer = SeasonStatsSerializer(stats)
        return Response(serializer.data)


class AssociationStatsAPIView(APIView):
    """API view for association-specific statistics."""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(60))  # Cache for 60 seconds
    def get(self, request, association_id):
        """Get statistics for a specific association."""
        stats = DashboardService.get_stats_by_association(association_id)
        if stats is None:
            return Response({"error": "Association not found"}, status=404)
        serializer = AssociationStatsSerializer(stats)
        return Response(serializer.data)


# SaaS Admin Dashboard API Views


class PlatformHealthAPIView(APIView):
    """API view for platform health metrics."""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(60))  # Cache for 60 seconds
    def get(self, request):
        """Get platform health metrics."""
        data = DashboardService.get_platform_health()
        serializer = PlatformHealthSerializer(data)
        return Response(serializer.data)


class RecentActivityAPIView(APIView):
    """API view for recent user activity."""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(30))  # Cache for 30 seconds
    def get(self, request):
        """Get recent activity feed."""
        hours = int(request.query_params.get("hours", 24))
        limit = int(request.query_params.get("limit", 20))

        data = DashboardService.get_recent_activity(hours=hours, limit=limit)
        serializer = RecentActionSerializer(data, many=True)
        return Response(serializer.data)


class OnlineUsersAPIView(APIView):
    """API view for currently active users."""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(
        cache_page(15)
    )  # Cache for 15 seconds (short cache for real-time feel)
    def get(self, request):
        """Get list of online users."""
        minutes = int(request.query_params.get("minutes", 15))

        data = DashboardService.get_online_users(minutes=minutes)
        serializer = OnlineUserSerializer(data, many=True)
        return Response(serializer.data)


class ContentCreationAPIView(APIView):
    """API view for content creation statistics."""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(60))  # Cache for 60 seconds
    def get(self, request):
        """Get content creation metrics."""
        days = int(request.query_params.get("days", 30))

        data = DashboardService.get_content_creation_stats(days=days)
        serializer = ContentCreationSerializer(data)
        return Response(serializer.data)


class FeatureUsageAPIView(APIView):
    """API view for feature usage metrics."""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(60))  # Cache for 60 seconds
    def get(self, request):
        """Get feature adoption statistics."""
        days = int(request.query_params.get("days", 30))

        data = DashboardService.get_feature_usage_stats(days=days)
        serializer = FeatureUsageSerializer(data)
        return Response(serializer.data)


class UserSegmentsAPIView(APIView):
    """API view for user segmentation."""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(60))  # Cache for 60 seconds
    def get(self, request):
        """Get user segmentation data."""
        data = DashboardService.get_user_segments()
        serializer = UserSegmentsSerializer(data)
        return Response(serializer.data)


class ProblemAlertsAPIView(APIView):
    """API view for problem detection alerts."""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(60))  # Cache for 60 seconds
    def get(self, request):
        """Get problem alerts."""
        data = DashboardService.get_problem_alerts()
        serializer = ProblemAlertsSerializer(data)
        return Response(serializer.data)


class UsersPerTeamAPIView(APIView):
    """API view for users per team statistics."""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(60))  # Cache for 60 seconds
    def get(self, request):
        """Get users per team data."""
        data = DashboardService.get_users_per_team()
        serializer = UsersPerTeamSerializer(data)
        return Response(serializer.data)


# Admin Dashboard API Views


class AdminStatsAPIView(APIView):
    """Combined admin dashboard stats endpoint"""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(60))
    def get(self, request):
        """Get all admin statistics"""
        data = {
            "stats": DashboardService.get_admin_stats(),
            "games_per_league": DashboardService.get_games_per_league(),
            "teams_per_league": DashboardService.get_teams_per_league(),
            "teams_per_association": DashboardService.get_teams_per_association(),
            "referees_per_team": DashboardService.get_referees_per_team(),
            "league_hierarchy": DashboardService.get_league_hierarchy_stats(),
            "teams_list": DashboardService.get_teams_list(),
            "gameday_schedule": DashboardService.get_gameday_schedule(),
        }
        serializer = AdminDashboardSerializer(data)
        return Response(serializer.data)


class LeagueHierarchyAPIView(APIView):
    """League hierarchy stats endpoint"""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(60))
    def get(self, request):
        """Get hierarchical league statistics"""
        data = DashboardService.get_league_hierarchy_stats()
        serializer = LeagueHierarchySerializer(data, many=True)
        return Response(serializer.data)


class GamesPerLeagueAPIView(APIView):
    """Games per league endpoint"""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(60))
    def get(self, request):
        """Get game counts per league"""
        data = DashboardService.get_games_per_league()
        serializer = GamesPerLeagueSerializer(data, many=True)
        return Response(serializer.data)


class TeamsPerLeagueAPIView(APIView):
    """Teams per league endpoint"""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(60))
    def get(self, request):
        """Get team counts per league"""
        data = DashboardService.get_teams_per_league()
        serializer = TeamsPerLeagueSerializer(data, many=True)
        return Response(serializer.data)


class TeamsPerAssociationAPIView(APIView):
    """Teams per state association endpoint"""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(60))
    def get(self, request):
        """Get team counts per state association"""
        data = DashboardService.get_teams_per_association()
        serializer = TeamsPerAssociationSerializer(data, many=True)
        return Response(serializer.data)


class RefereesPerTeamAPIView(APIView):
    """Referees per team endpoint"""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(60))
    def get(self, request):
        """Get referee counts per team"""
        data = DashboardService.get_referees_per_team()
        serializer = RefereesPerTeamSerializer(data, many=True)
        return Response(serializer.data)
