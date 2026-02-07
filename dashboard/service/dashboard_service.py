from datetime import datetime
from django.db.models import Count, Q, Sum, Avg
from django.contrib.auth import get_user_model

from gamedays.models import (
    Gameinfo,
    Gameresult,
    TeamLog,
    League,
    Season,
    Association,
    Team,
)

User = get_user_model()


class DashboardService:
    """Service layer for dashboard data aggregation."""

    @staticmethod
    def get_live_games():
        """
        Returns games currently in progress.
        Pattern from liveticker_service.py
        """
        from django.db.models import Subquery, OuterRef, F

        live_games = (
            Gameinfo.objects.filter(status__in=["1. Halbzeit", "2. Halbzeit"])
            .select_related("gameday", "gameday__league")
            .annotate(
                home_team_name=Subquery(
                    Gameresult.objects.filter(gameinfo=OuterRef("id"), isHome=True)
                    .values("team__name")[:1]
                ),
                away_team_name=Subquery(
                    Gameresult.objects.filter(gameinfo=OuterRef("id"), isHome=False)
                    .values("team__name")[:1]
                ),
                score_home=Subquery(
                    Gameresult.objects.filter(gameinfo=OuterRef("id"), isHome=True)
                    .annotate(total=(F("fh") + F("sh")))
                    .values("total")[:1]
                ),
                score_away=Subquery(
                    Gameresult.objects.filter(gameinfo=OuterRef("id"), isHome=False)
                    .annotate(total=(F("fh") + F("sh")))
                    .values("total")[:1]
                ),
            )
        )

        result = []
        for game in live_games:
            result.append({
                "game_id": game.pk,
                "home_team": game.home_team_name or "Unknown",
                "away_team": game.away_team_name or "Unknown",
                "status": game.status,
                "score": {
                    "home": game.score_home or 0,
                    "away": game.score_away or 0,
                },
                "league": game.gameday.league.name,
                "gameday": str(game.gameday.date),
            })

        return result

    @staticmethod
    def get_summary_stats():
        """Returns overall statistics."""
        total_games = Gameinfo.objects.count()
        live_games = Gameinfo.objects.filter(
            status__in=["1. Halbzeit", "2. Halbzeit"]
        ).count()
        total_teams = Team.objects.count()
        total_players = User.objects.filter(is_active=True).count()

        # Calculate completion rate (games with results vs total games)
        games_with_results = Gameresult.objects.values("gameinfo").distinct().count()
        completion_rate = (
            (games_with_results / total_games * 100) if total_games > 0 else 0
        )

        return {
            "total_games": total_games,
            "live_games": live_games,
            "total_teams": total_teams,
            "total_players": total_players,
            "completion_rate": round(completion_rate, 2),
        }

    @staticmethod
    def get_stats_by_league(league_id):
        """Returns statistics for specific league."""
        try:
            league = League.objects.get(pk=league_id)
        except League.DoesNotExist:
            return None

        # Games in this league
        games = Gameinfo.objects.filter(gameday__league=league)
        total_games = games.count()

        # Teams in this league
        teams = Team.objects.filter(league=league)
        total_teams = teams.count()

        # Games with results
        games_with_results = games.filter(gameresult__isnull=False).distinct().count()
        completion_rate = (
            (games_with_results / total_games * 100) if total_games > 0 else 0
        )

        return {
            "league_id": league.pk,
            "league_name": league.name,
            "total_games": total_games,
            "total_teams": total_teams,
            "completion_rate": round(completion_rate, 2),
        }

    @staticmethod
    def get_stats_by_season(season_id):
        """Returns statistics for specific season."""
        try:
            season = Season.objects.get(pk=season_id)
        except Season.DoesNotExist:
            return None

        # Games in this season
        games = Gameinfo.objects.filter(gameday__season=season)
        total_games = games.count()

        # Games with results
        games_with_results = games.filter(gameresult__isnull=False).distinct().count()
        completion_rate = (
            (games_with_results / total_games * 100) if total_games > 0 else 0
        )

        return {
            "season_id": season.pk,
            "season_name": season.name,
            "total_games": total_games,
            "completion_rate": round(completion_rate, 2),
        }

    @staticmethod
    def get_stats_by_association(association_id):
        """Returns statistics for specific association."""
        try:
            association = Association.objects.get(pk=association_id)
        except Association.DoesNotExist:
            return None

        # Leagues in this association
        leagues = League.objects.filter(association=association)
        total_leagues = leagues.count()

        # Games across all leagues in this association
        games = Gameinfo.objects.filter(gameday__league__association=association)
        total_games = games.count()

        # Teams across all leagues
        total_teams = Team.objects.filter(league__association=association).count()

        # Games with results
        games_with_results = games.filter(gameresult__isnull=False).distinct().count()
        completion_rate = (
            (games_with_results / total_games * 100) if total_games > 0 else 0
        )

        return {
            "association_id": association.pk,
            "association_name": association.name,
            "total_leagues": total_leagues,
            "total_games": total_games,
            "total_teams": total_teams,
            "completion_rate": round(completion_rate, 2),
        }
