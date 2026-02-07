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
