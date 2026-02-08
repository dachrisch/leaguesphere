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
            return Response(
                {"error": "League not found"},
                status=404
            )
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
            return Response(
                {"error": "Season not found"},
                status=404
            )
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
            return Response(
                {"error": "Association not found"},
                status=404
            )
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
        hours = int(request.query_params.get('hours', 24))
        limit = int(request.query_params.get('limit', 20))

        data = DashboardService.get_recent_activity(hours=hours, limit=limit)
        serializer = RecentActionSerializer(data, many=True)
        return Response(serializer.data)


class OnlineUsersAPIView(APIView):
    """API view for currently active users."""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(15))  # Cache for 15 seconds (short cache for real-time feel)
    def get(self, request):
        """Get list of online users."""
        minutes = int(request.query_params.get('minutes', 15))

        data = DashboardService.get_online_users(minutes=minutes)
        serializer = OnlineUserSerializer(data, many=True)
        return Response(serializer.data)


class ContentCreationAPIView(APIView):
    """API view for content creation statistics."""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(60))  # Cache for 60 seconds
    def get(self, request):
        """Get content creation metrics."""
        days = int(request.query_params.get('days', 30))

        data = DashboardService.get_content_creation_stats(days=days)
        serializer = ContentCreationSerializer(data)
        return Response(serializer.data)


class FeatureUsageAPIView(APIView):
    """API view for feature usage metrics."""

    permission_classes = [permissions.IsAuthenticated]

    @method_decorator(cache_page(60))  # Cache for 60 seconds
    def get(self, request):
        """Get feature adoption statistics."""
        days = int(request.query_params.get('days', 30))

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
