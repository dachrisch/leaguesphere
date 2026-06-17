import hashlib
from datetime import timedelta
from django.utils import timezone
from django.views.decorators.http import condition
from django.utils.decorators import method_decorator
from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from gamedays.models import Gameday


class LeagueAdoptionSerializer:
    """
    Serializes per-league game creation statistics.
    Fields: league_name, league_id, designer, legacy, total, designer_percentage
    """

    def __init__(self, league_name, league_id, designer, legacy):
        self.league_name = league_name
        self.league_id = league_id
        self.designer = designer
        self.legacy = legacy
        self.total = designer + legacy
        self.designer_percentage = (
            (designer / self.total * 100) if self.total > 0 else 0.0
        )

    def to_dict(self):
        return {
            'league_name': self.league_name,
            'league_id': self.league_id,
            'designer': self.designer,
            'legacy': self.legacy,
            'total': self.total,
            'designer_percentage': round(self.designer_percentage, 1),
        }


class TimePeriodStatsSerializer:
    """
    Serializes game creation statistics for a single time period (7, 30, or 90 days).
    Fields: designer, legacy, total, designer_percentage
    """

    def __init__(self, designer, legacy):
        self.designer = designer
        self.legacy = legacy
        self.total = designer + legacy
        self.designer_percentage = (
            (designer / self.total * 100) if self.total > 0 else 0.0
        )

    def to_dict(self):
        return {
            'designer': self.designer,
            'legacy': self.legacy,
            'total': self.total,
            'designer_percentage': round(self.designer_percentage, 1),
        }


class GameCreationStatsSerializer:
    """
    Serializes full game creation statistics response.
    Fields: summary (dict of period → TimePeriodStatsSerializer),
            by_league (dict of period → list of LeagueAdoptionSerializer)
    """

    def __init__(self, summary, by_league):
        self.summary = summary
        self.by_league = by_league

    def to_dict(self):
        return {
            'summary': {
                period: stats.to_dict()
                for period, stats in self.summary.items()
            },
            'by_league': {
                period: [league.to_dict() for league in leagues]
                for period, leagues in self.by_league.items()
            },
        }


class GameCreationStatsService:
    """
    Service for calculating game creation statistics (designer vs legacy adoption).
    Filters gamedays by date range and detects designer games via GamedayDesignerState.
    """

    @staticmethod
    def get_stats(days_list=None, league_filter=None, season_filter=None):
        """
        Get game creation statistics for specified time periods.

        Args:
            days_list: List of integers (7, 30, 90) for time windows. Defaults to [7, 30, 90].
            league_filter: Optional league name/id to filter results.
            season_filter: Optional season name/id to filter results.

        Returns:
            GameCreationStatsSerializer instance with summary and by_league breakdowns.
        """
        if days_list is None:
            days_list = [7, 30, 90]

        summary = {}
        by_league = {}

        now = timezone.now()

        for days in days_list:
            # Calculate date range: NOW() - INTERVAL X DAY
            start_date = (now - timedelta(days=days)).date()

            # Base queryset for this time period
            queryset = Gameday.objects.filter(date__gte=start_date)

            # Apply optional filters
            if league_filter:
                queryset = queryset.filter(
                    league__name__icontains=league_filter
                ) | queryset.filter(league__pk=league_filter)

            if season_filter:
                queryset = queryset.filter(
                    season__name__icontains=season_filter
                ) | queryset.filter(season__pk=season_filter)

            # Count designer vs legacy games
            # Designer detection: presence of GamedayDesignerState record (designer_state__isnull=False)
            # Legacy detection: no GamedayDesignerState record (designer_state__isnull=True)
            designer_count = queryset.filter(designer_state__isnull=False).count()
            legacy_count = queryset.filter(designer_state__isnull=True).count()

            # Create summary for this period
            summary[str(days)] = TimePeriodStatsSerializer(designer_count, legacy_count)

            # Get per-league breakdown
            league_stats = {}
            for gameday in queryset:
                league_key = (gameday.league.name, gameday.league.pk)
                if league_key not in league_stats:
                    league_stats[league_key] = {'designer': 0, 'legacy': 0}

                if hasattr(gameday, 'designer_state'):
                    league_stats[league_key]['designer'] += 1
                else:
                    league_stats[league_key]['legacy'] += 1

            # Convert to LeagueAdoptionSerializer list and sort by designer_percentage descending
            league_list = [
                LeagueAdoptionSerializer(
                    league_name=league_key[0],
                    league_id=league_key[1],
                    designer=counts['designer'],
                    legacy=counts['legacy'],
                )
                for league_key, counts in league_stats.items()
            ]

            # Sort by designer_percentage descending
            league_list.sort(key=lambda x: x.designer_percentage, reverse=True)
            by_league[str(days)] = league_list

        return GameCreationStatsSerializer(summary, by_league)


class GameCreationStatsViewSet(viewsets.ViewSet):
    """
    Read-only ViewSet for game creation statistics.
    Returns adoption metrics for designer vs legacy gameday creation.
    """

    permission_classes = [IsAuthenticated]

    @staticmethod
    def etag_func(request):
        """
        Generate ETag for cache invalidation based on:
        - Latest gameday pk
        - Query parameters (days, league, season)
        """
        try:
            latest_gameday_pk = Gameday.objects.values_list(
                'pk', flat=True
            ).order_by('-pk').first() or 'none'
        except Gameday.DoesNotExist:
            latest_gameday_pk = 'none'

        days = request.query_params.get('days', '7,30,90')
        league = request.query_params.get('league', '')
        season = request.query_params.get('season', '')

        etag_data = f"{latest_gameday_pk}:{days}:{league}:{season}"
        return f'"{hashlib.md5(etag_data.encode()).hexdigest()}"'

    @method_decorator(condition(etag_func=etag_func.__func__))
    def list(self, request):
        """
        Get game creation statistics.

        Query Parameters:
            - days: Comma-separated list of time windows (default: "7,30,90")
            - league: Optional league name/id filter
            - season: Optional season name/id filter

        Returns:
            JSON with summary and by_league statistics.

        Raises:
            ValidationError (400): If days parameter is invalid.
        """
        # Parse days parameter
        days_param = request.query_params.get('days', '7,30,90')
        try:
            days_list = [int(d.strip()) for d in days_param.split(',')]
        except (ValueError, AttributeError):
            raise ValidationError({'days': 'Must be comma-separated integers (e.g., "7,30,90")'})

        # Get optional filters
        league_filter = request.query_params.get('league')
        season_filter = request.query_params.get('season')

        # Get stats via service
        stats = GameCreationStatsService.get_stats(
            days_list=days_list,
            league_filter=league_filter,
            season_filter=season_filter,
        )

        return Response(stats.to_dict())
