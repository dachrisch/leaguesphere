"""
Views for Game Progress Dashboard API

GameProgressViewSet provides real-time game day status for the
game progress dashboard. Returns denormalized data with all
games for each game day.

Filtering:
  - date_from: ISO date (default: today - 1 day)
  - date_to: ISO date (default: today + 7 days)
  - league: League ID
  - season: Season ID
  - status: Gameday status (DRAFT, PUBLISHED, IN_PROGRESS, COMPLETED)

Permissions:
  - Staff only (is_staff=True)
"""

from datetime import datetime, timedelta
from django.utils import timezone
from rest_framework import viewsets, filters, permissions
from rest_framework.pagination import PageNumberPagination

from gamedays.models import Gameday
from .serializers import GameProgressSerializer


class IsStaff(permissions.BasePermission):
    """Only allow staff users to access"""

    def has_permission(self, request, view):
        return request.user and request.user.is_staff


class GameProgressPagination(PageNumberPagination):
    """Pagination for game progress endpoint"""

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class GameProgressViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for game progress dashboard.

    Returns denormalized gamedays with all games and results.
    Defaults to past 1 day + next 7 days.

    Query parameters:
      - date_from: ISO date (YYYY-MM-DD)
      - date_to: ISO date (YYYY-MM-DD)
      - league: League ID
      - season: Season ID
      - status: Gameday status
      - page_size: Results per page (default: 50, max: 200)
    """

    serializer_class = GameProgressSerializer
    pagination_class = GameProgressPagination
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['date']
    ordering = ['-date']
    permission_classes = [IsStaff]

    def get_queryset(self):
        """
        Filter gamedays by date range and optional league/season/status.
        Optimizes queries with select_related and prefetch_related.
        """
        queryset = Gameday.objects.all()

        # Parse date filters from query params
        date_from_param = self.request.query_params.get('date_from')
        date_to_param = self.request.query_params.get('date_to')

        # Default: past 1 day + next 7 days
        if not date_from_param:
            date_from = timezone.now().date() - timedelta(days=1)
        else:
            try:
                date_from = datetime.fromisoformat(date_from_param).date()
            except (ValueError, TypeError):
                date_from = timezone.now().date() - timedelta(days=1)

        if not date_to_param:
            date_to = timezone.now().date() + timedelta(days=7)
        else:
            try:
                date_to = datetime.fromisoformat(date_to_param).date()
            except (ValueError, TypeError):
                date_to = timezone.now().date() + timedelta(days=7)

        # Filter by date range
        queryset = queryset.filter(date__gte=date_from, date__lte=date_to)

        # Optional filters: league, season, status
        league_id = self.request.query_params.get('league')
        if league_id:
            queryset = queryset.filter(league_id=league_id)

        season_id = self.request.query_params.get('season')
        if season_id:
            queryset = queryset.filter(season_id=season_id)

        status = self.request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status)

        # Optimize queries: prefetch games and results
        queryset = queryset.prefetch_related(
            'gameinfo_set',
            'gameinfo_set__gameresult_set'
        ).select_related('league', 'season')

        return queryset
