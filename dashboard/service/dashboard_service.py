from datetime import datetime, timedelta
from django.db.models import (
    Count,
    Q,
    Sum,
    Avg,
    F,
    Value,
    CharField,
    Exists,
    OuterRef,
    Subquery,
    Case,
    When,
    IntegerField,
    Prefetch,
)
from django.contrib.auth import get_user_model
from django.utils import timezone

from gamedays.models import (
    Gameinfo,
    Gameresult,
    TeamLog,
    League,
    Season,
    Association,
    Team,
    Gameday,
    UserProfile,
    UserPermissions,
)
from passcheck.models import (
    Playerlist,
    PlayerlistTransfer,
    PasscheckVerification,
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
                    Gameresult.objects.filter(
                        gameinfo=OuterRef("id"), isHome=True
                    ).values("team__name")[:1]
                ),
                away_team_name=Subquery(
                    Gameresult.objects.filter(
                        gameinfo=OuterRef("id"), isHome=False
                    ).values("team__name")[:1]
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
            result.append(
                {
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
                }
            )

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

    @staticmethod
    def get_platform_health():
        """
        Platform health metrics for SaaS admin dashboard.
        Returns active users, total users, and growth metrics.
        """
        now = timezone.now()
        today = now.date()
        seven_days_ago = now - timedelta(days=7)
        thirty_days_ago = now - timedelta(days=30)
        fourteen_days_ago = now - timedelta(days=14)

        # Active users today (users with activity via PasscheckVerification or PlayerlistTransfer)
        active_today = (
            User.objects.filter(
                Q(passcheckverification__created_at__date=today)
                | Q(playerlisttransfer__created_at__date=today)
            )
            .distinct()
            .count()
        )

        # Active users in last 7 days (WAU)
        active_7d_current = (
            User.objects.filter(
                Q(passcheckverification__created_at__gte=seven_days_ago)
                | Q(playerlisttransfer__created_at__gte=seven_days_ago)
            )
            .distinct()
            .count()
        )

        # Previous 7 days for trend calculation
        active_7d_previous = (
            User.objects.filter(
                Q(
                    passcheckverification__created_at__range=(
                        fourteen_days_ago,
                        seven_days_ago,
                    )
                )
                | Q(
                    playerlisttransfer__created_at__range=(
                        fourteen_days_ago,
                        seven_days_ago,
                    )
                )
            )
            .distinct()
            .count()
        )

        # Calculate trend percentage
        trend_7d = 0
        if active_7d_previous > 0:
            trend_7d = round(
                ((active_7d_current - active_7d_previous) / active_7d_previous * 100), 1
            )

        # Total active users
        total_users = User.objects.filter(is_active=True).count()

        # User breakdown by role
        # Team managers (via UserPermissions)
        team_manager_permission = (
            UserPermissions.objects.filter(permission__name="Teammanager")
            .values_list("user__user_id", flat=True)
            .distinct()
        )
        team_managers_count = len(set(team_manager_permission))

        # Officials (users who have created PasscheckVerifications)
        officials_users = PasscheckVerification.objects.values_list(
            "user_id", flat=True
        ).distinct()
        officials_count = len(set(officials_users))

        # Players (total - team managers - officials, rough estimate)
        # Note: Some overlap may occur between roles
        players_count = max(0, total_users - team_managers_count - officials_count)

        # New users in last 30 days
        new_users = User.objects.filter(date_joined__gte=thirty_days_ago).count()

        # Average new users per week
        avg_new_per_week = round(new_users / 4.3, 1)  # ~4.3 weeks in 30 days

        return {
            "active_today": active_today,
            "active_7d": active_7d_current,
            "trend_7d": trend_7d,
            "total_users": total_users,
            "team_managers": team_managers_count,
            "officials": officials_count,
            "players": players_count,
            "new_users_30d": new_users,
            "avg_new_per_week": avg_new_per_week,
        }

    @staticmethod
    def get_recent_activity(hours=24, limit=20):
        """
        Returns recent user activity from multiple sources.
        Aggregates PasscheckVerifications and PlayerlistTransfers.
        """
        cutoff_time = timezone.now() - timedelta(hours=hours)

        activities = []

        # PasscheckVerifications
        verifications = (
            PasscheckVerification.objects.filter(created_at__gte=cutoff_time)
            .select_related("team", "gameday", "user")
            .order_by("-created_at")[:limit]
        )

        for verification in verifications:
            try:
                user_name = f"{verification.user.userprofile.firstname or 'Unknown'} {verification.user.userprofile.lastname or 'User'}"
            except UserProfile.DoesNotExist:
                user_name = verification.user.username
            activities.append(
                {
                    "action_type": "passcheck_verification",
                    "action_time": verification.created_at,
                    "user_name": user_name,
                    "user_role": "Official",
                    "description": f"Verified roster for {verification.team.name}",
                }
            )

        # PlayerlistTransfers
        transfers = (
            PlayerlistTransfer.objects.filter(created_at__gte=cutoff_time)
            .select_related("current_team__team", "new_team", "approved_by")
            .order_by("-created_at")[:limit]
        )

        for transfer in transfers:
            user_name = "System"
            if transfer.approved_by:
                try:
                    user_name = f"{transfer.approved_by.userprofile.firstname or 'Unknown'} {transfer.approved_by.userprofile.lastname or 'User'}"
                except UserProfile.DoesNotExist:
                    user_name = transfer.approved_by.username

            activities.append(
                {
                    "action_type": "player_transfer",
                    "action_time": transfer.created_at,
                    "user_name": user_name,
                    "user_role": "Team Manager",
                    "description": f"Transfer: {transfer.current_team.team.name} → {transfer.new_team.name} ({transfer.status})",
                }
            )

        # Sort all activities by time and limit
        activities.sort(key=lambda x: x["action_time"], reverse=True)
        return activities[:limit]

    @staticmethod
    def get_online_users(minutes=15):
        """
        Returns users with activity in the last N minutes.
        """
        cutoff_time = timezone.now() - timedelta(minutes=minutes)

        online_users = User.objects.filter(
            Q(passcheckverification__created_at__gte=cutoff_time)
            | Q(passcheckverification__updated_at__gte=cutoff_time)
            | Q(playerlisttransfer__created_at__gte=cutoff_time)
        ).distinct()

        result = []
        for user in online_users:
            try:
                user_name = f"{user.userprofile.firstname or 'Unknown'} {user.userprofile.lastname or 'User'}"
                team_name = (
                    user.userprofile.team.name if user.userprofile.team else "No Team"
                )
            except UserProfile.DoesNotExist:
                user_name = user.username
                team_name = "No Team"

            # Determine role
            role = "Player"
            if UserPermissions.objects.filter(
                user__user=user, permission__name="Teammanager"
            ).exists():
                role = "Team Manager"
            elif PasscheckVerification.objects.filter(user=user).exists():
                role = "Official"

            result.append(
                {
                    "user_name": user_name,
                    "user_role": role,
                    "team": team_name,
                }
            )

        return result

    @staticmethod
    def get_content_creation_stats(days=30):
        """
        Content creation metrics: gamedays, roster changes, verifications.
        Note: Gameinfo doesn't have created_at, so we use Gameday.published_at as proxy.
        """
        cutoff_date = timezone.now() - timedelta(days=days)

        # Gamedays published (using published_at field)
        gamedays_published = Gameday.objects.filter(
            published_at__gte=cutoff_date, published_at__isnull=False
        ).count()

        # Average games per gameday
        games_in_published_gamedays = Gameinfo.objects.filter(
            gameday__published_at__gte=cutoff_date, gameday__published_at__isnull=False
        ).count()
        avg_games_per_gameday = (
            round(games_in_published_gamedays / gamedays_published, 1)
            if gamedays_published > 0
            else 0
        )

        # Top gameday publishers
        top_publishers = (
            Gameday.objects.filter(
                published_at__gte=cutoff_date, published_at__isnull=False
            )
            .values("author__userprofile__firstname", "author__userprofile__lastname")
            .annotate(count=Count("id"))
            .order_by("-count")[:5]
        )

        publishers_list = [
            {
                "name": f"{p['author__userprofile__firstname'] or 'Unknown'} {p['author__userprofile__lastname'] or 'User'}",
                "count": p["count"],
            }
            for p in top_publishers
        ]

        # Roster activity (using Playerlist.joined_on)
        new_players = Playerlist.objects.filter(
            joined_on__gte=cutoff_date.date()
        ).count()

        # Transfers
        transfers = PlayerlistTransfer.objects.filter(
            created_at__gte=cutoff_date
        ).count()

        # Players who left (Playerlist with left_on set in period)
        players_left = Playerlist.objects.filter(
            left_on__gte=cutoff_date.date(), left_on__isnull=False
        ).count()

        # Most active teams (by roster changes)
        active_teams_roster = (
            Playerlist.objects.filter(joined_on__gte=cutoff_date.date())
            .values("team__name")
            .annotate(count=Count("id"))
            .order_by("-count")[:5]
        )

        teams_list = [
            {"name": t["team__name"], "changes": t["count"]}
            for t in active_teams_roster
        ]

        # Passcheck verifications
        verifications_count = PasscheckVerification.objects.filter(
            created_at__gte=cutoff_date
        ).count()

        return {
            "gamedays_published": gamedays_published,
            "avg_games_per_gameday": avg_games_per_gameday,
            "top_publishers": publishers_list,
            "new_players": new_players,
            "transfers": transfers,
            "players_left": players_left,
            "top_teams_roster": teams_list,
            "verifications": verifications_count,
        }

    @staticmethod
    def get_feature_usage_stats(days=30):
        """
        Feature adoption metrics: Scorecard, Liveticker, Passcheck.
        """
        cutoff_date = timezone.now() - timedelta(days=days)

        # Total games in period (use gameday.published_at as proxy)
        total_games = Gameinfo.objects.filter(
            gameday__published_at__gte=cutoff_date, gameday__published_at__isnull=False
        ).count()

        # Scorecard usage (games with TeamLog entries)
        games_with_scoring = (
            Gameinfo.objects.filter(
                gameday__published_at__gte=cutoff_date,
                gameday__published_at__isnull=False,
                teamlog__isnull=False,
            )
            .distinct()
            .count()
        )

        scorecard_adoption = (
            round((games_with_scoring / total_games * 100), 1) if total_games > 0 else 0
        )

        # Total scoring events
        total_events = TeamLog.objects.filter(
            gameinfo__gameday__published_at__gte=cutoff_date
        ).count()

        avg_events_per_game = (
            round(total_events / games_with_scoring, 1) if games_with_scoring > 0 else 0
        )

        # Liveticker usage (games that progressed beyond "Geplant")
        games_with_ticker = Gameinfo.objects.filter(
            gameday__published_at__gte=cutoff_date,
            gameday__published_at__isnull=False,
            status__in=["Gestartet", "1. Halbzeit", "2. Halbzeit", "Beendet"],
        ).count()

        liveticker_adoption = (
            round((games_with_ticker / total_games * 100), 1) if total_games > 0 else 0
        )

        # Passcheck usage
        passcheck_verifications = PasscheckVerification.objects.filter(
            created_at__gte=cutoff_date
        ).count()

        teams_verified = (
            PasscheckVerification.objects.filter(created_at__gte=cutoff_date)
            .values("team")
            .distinct()
            .count()
        )

        return {
            "total_games": total_games,
            "scorecard_adoption": scorecard_adoption,
            "scorecard_games": games_with_scoring,
            "scorecard_events": total_events,
            "scorecard_avg_events": avg_events_per_game,
            "liveticker_adoption": liveticker_adoption,
            "liveticker_games": games_with_ticker,
            "passcheck_verifications": passcheck_verifications,
            "passcheck_teams": teams_verified,
        }

    @staticmethod
    def get_user_segments():
        """
        User segmentation by role and organization.
        """
        thirty_days_ago = timezone.now() - timedelta(days=30)

        # Team managers
        team_manager_users = (
            UserPermissions.objects.filter(permission__name="Teammanager")
            .values_list("user__user_id", flat=True)
            .distinct()
        )
        team_manager_user_ids = list(set(team_manager_users))

        total_tms = len(team_manager_user_ids)

        active_tms = (
            User.objects.filter(id__in=team_manager_user_ids)
            .filter(
                Q(passcheckverification__created_at__gte=thirty_days_ago)
                | Q(playerlisttransfer__created_at__gte=thirty_days_ago)
            )
            .distinct()
            .count()
        )

        activity_rate_tms = (
            round((active_tms / total_tms * 100), 1) if total_tms > 0 else 0
        )

        # Officials (users who created PasscheckVerifications)
        official_users = PasscheckVerification.objects.values_list(
            "user_id", flat=True
        ).distinct()
        official_user_ids = list(set(official_users))

        total_officials = len(official_user_ids)

        active_officials = (
            User.objects.filter(id__in=official_user_ids)
            .filter(
                Q(passcheckverification__created_at__gte=thirty_days_ago)
                | Q(playerlisttransfer__created_at__gte=thirty_days_ago)
            )
            .distinct()
            .count()
        )

        activity_rate_officials = (
            round((active_officials / total_officials * 100), 1)
            if total_officials > 0
            else 0
        )

        # Players (all other users)
        total_users = User.objects.filter(is_active=True).count()
        total_players = total_users - total_tms - total_officials

        active_players = (
            User.objects.filter(is_active=True)
            .exclude(id__in=team_manager_user_ids + official_user_ids)
            .filter(
                Q(passcheckverification__created_at__gte=thirty_days_ago)
                | Q(playerlisttransfer__created_at__gte=thirty_days_ago)
            )
            .distinct()
            .count()
        )

        activity_rate_players = (
            round((active_players / total_players * 100), 1) if total_players > 0 else 0
        )

        # Top 5 active teams (by roster changes and verifications)
        active_teams = Team.objects.annotate(
            roster_changes=Count(
                "playerlist",
                filter=Q(playerlist__joined_on__gte=thirty_days_ago.date()),
            ),
            verifications=Count(
                "passcheckverification",
                filter=Q(passcheckverification__created_at__gte=thirty_days_ago),
            ),
            total_activity=F("roster_changes") + F("verifications"),
        ).order_by("-total_activity")[:5]

        teams_list = [
            {
                "name": team.name,
                "roster_changes": team.roster_changes,
                "verifications": team.verifications,
                "total_activity": team.total_activity,
            }
            for team in active_teams
        ]

        return {
            "team_managers": {
                "total": total_tms,
                "active_30d": active_tms,
                "activity_rate": activity_rate_tms,
            },
            "officials": {
                "total": total_officials,
                "active_30d": active_officials,
                "activity_rate": activity_rate_officials,
            },
            "players": {
                "total": total_players,
                "active_30d": active_players,
                "activity_rate": activity_rate_players,
            },
            "top_teams": teams_list,
        }

    @staticmethod
    def get_users_per_team():
        """
        Get user count per team, sorted by user count descending.
        """
        # Count users with UserProfile per team
        teams_with_users = (
            Team.objects.annotate(
                user_count=Count(
                    "userprofile", filter=Q(userprofile__user__is_active=True)
                )
            )
            .filter(user_count__gt=0)
            .order_by("-user_count")
        )

        teams_list = [
            {
                "team_name": team.name,
                "user_count": team.user_count,
                "association": team.association.name
                if team.association
                else "No Association",
            }
            for team in teams_with_users
        ]

        total_users_with_teams = sum(team["user_count"] for team in teams_list)
        total_teams_with_users = len(teams_list)

        # Users without teams
        users_without_team = UserProfile.objects.filter(
            team__isnull=True, user__is_active=True
        ).count()

        return {
            "teams": teams_list,
            "total_teams_with_users": total_teams_with_users,
            "total_users_with_teams": total_users_with_teams,
            "users_without_team": users_without_team,
        }

    @staticmethod
    def get_problem_alerts():
        """
        Identify problems: inactive users, teams without activity, unused accounts.
        """
        now = timezone.now()
        thirty_days_ago = now - timedelta(days=30)
        sixty_days_ago = now - timedelta(days=60)

        # Inactive team managers (30+ days no activity)
        team_manager_users = (
            UserPermissions.objects.filter(permission__name="Teammanager")
            .values_list("user__user_id", flat=True)
            .distinct()
        )
        team_manager_user_ids = list(set(team_manager_users))

        inactive_tms = User.objects.filter(
            id__in=team_manager_user_ids, is_active=True
        ).exclude(
            Q(passcheckverification__created_at__gte=thirty_days_ago)
            | Q(playerlisttransfer__created_at__gte=thirty_days_ago)
        )

        # Prioritize never-active vs recently-inactive
        never_active_tms = []
        recently_inactive_tms = []

        for tm in inactive_tms:
            has_any_activity = (
                PasscheckVerification.objects.filter(user=tm).exists()
                or PlayerlistTransfer.objects.filter(approved_by=tm).exists()
            )

            try:
                user_name = f"{tm.userprofile.firstname or 'Unknown'} {tm.userprofile.lastname or 'User'}"
                team_name = (
                    tm.userprofile.team.name if tm.userprofile.team else "No Team"
                )
            except UserProfile.DoesNotExist:
                user_name = tm.username
                team_name = "No Team"

            if not has_any_activity:
                never_active_tms.append(
                    {
                        "name": user_name,
                        "team": team_name,
                        "joined_days_ago": (now - tm.date_joined).days,
                    }
                )
            else:
                recently_inactive_tms.append(
                    {
                        "name": user_name,
                        "team": team_name,
                    }
                )

        # Teams without recent activity (60+ days)
        inactive_teams = Team.objects.annotate(
            recent_roster=Count(
                "playerlist", filter=Q(playerlist__joined_on__gte=sixty_days_ago.date())
            ),
            recent_verifications=Count(
                "passcheckverification",
                filter=Q(passcheckverification__created_at__gte=sixty_days_ago),
            ),
        ).filter(recent_roster=0, recent_verifications=0)

        inactive_teams_list = [
            {"name": team.name}
            for team in inactive_teams[:10]  # Limit to top 10
        ]

        # Unused accounts (age >30 days, zero lifetime activity)
        unused_accounts = (
            User.objects.filter(date_joined__lte=thirty_days_ago, is_active=True)
            .annotate(
                verifications_count=Count("passcheckverification"),
                transfers_count=Count("playerlisttransfer"),
            )
            .filter(verifications_count=0, transfers_count=0)
            .count()
        )

        return {
            "inactive_team_managers": {
                "total": len(never_active_tms) + len(recently_inactive_tms),
                "never_active": never_active_tms[:5],  # Top 5
                "recently_inactive": recently_inactive_tms[:5],  # Top 5
            },
            "inactive_teams": {
                "total": inactive_teams.count(),
                "teams": inactive_teams_list,
            },
            "unused_accounts": unused_accounts,
        }

    @staticmethod
    def get_admin_stats() -> dict:
        """Get core admin statistics: gamedays, teams, games"""
        # Count unique gamedays
        total_gamedays = Gameday.objects.count()

        # Count unique teams (exclude dummy placeholder teams)
        total_teams = Team.objects.exclude(location='dummy').distinct().count()

        # Count total games (Gameinfo)
        total_games = Gameinfo.objects.count()

        return {
            "gamedays": total_gamedays,
            "teams": total_teams,
            "games": total_games,
        }

    @staticmethod
    def get_games_per_league() -> list:
        """Get number of games per league"""
        data = (
            Gameinfo.objects.values("gameday__league__name", "gameday__league__id")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        return [
            {
                "league_name": item["gameday__league__name"] or "Unknown",
                "league_id": item["gameday__league__id"],
                "count": item["count"],
            }
            for item in data
        ]

    @staticmethod
    def get_teams_per_league() -> list:
        """Get number of teams per league"""
        data = (
            Team.objects.exclude(location='dummy')
            .filter(seasonleagueteam__isnull=False)
            .values("seasonleagueteam__league__name", "seasonleagueteam__league__id")
            .annotate(count=Count("id", distinct=True))
            .order_by("-count")
        )

        return [
            {
                "league_name": item["seasonleagueteam__league__name"] or "Unknown",
                "league_id": item["seasonleagueteam__league__id"],
                "count": item["count"],
            }
            for item in data
        ]

    @staticmethod
    def get_teams_per_association() -> list:
        """Get number of teams per state association"""
        data = (
            Team.objects.exclude(location='dummy')
            .values("association__name", "association__id")
            .annotate(count=Count("id", distinct=True))
            .order_by("-count")
        )

        return [
            {
                "association_name": item["association__name"] or "Unknown",
                "association_id": item["association__id"],
                "count": item["count"],
            }
            for item in data
        ]

    @staticmethod
    def get_referees_per_team() -> list:
        """Get number of referees per team

        Note: This requires a relationship between teams and officials.
        Current implementation returns empty list - needs data model mapping.
        """
        try:
            data = (
                Team.objects.exclude(location='dummy')
                .filter(gameinfo_officials__isnull=False)
                .values("id", "name")
                .annotate(count=Count("gameinfo_officials", distinct=True))
                .order_by("-count")
            )

            return [
                {
                    "team_id": item["id"],
                    "team_name": item["name"],
                    "count": item["count"],
                }
                for item in data
            ]
        except Exception:
            # Return empty if relation doesn't exist - requires implementation
            return []

    @staticmethod
    def get_league_hierarchy_stats() -> list:
        """
        Returns a hierarchical list of leagues, their seasons, and statistics.
        Format: League -> Seasons -> Stats
        """
        leagues = League.objects.all().order_by("name")
        result = []

        for league in leagues:
            seasons_in_league = (
                Season.objects.filter(gameday__league=league)
                .distinct()
                .order_by("-name")
            )

            if not seasons_in_league.exists():
                continue

            seasons_stats = []
            for season in seasons_in_league:
                gamedays = Gameday.objects.filter(league=league, season=season)
                gameday_count = gamedays.count()

                # Calculate averages across gamedays in this season/league
                # We need to count distinct teams and games per gameday
                gameday_stats = gamedays.annotate(
                    team_count=Count("gameinfo__gameresult__team", distinct=True),
                    game_count=Count("gameinfo", distinct=True),
                )

                averages = gameday_stats.aggregate(
                    avg_teams=Avg("team_count"), avg_games=Avg("game_count")
                )

                # Build gamedays list with game counts for navigation links
                gamedays_qs = Gameday.objects.filter(
                    league=league, season=season
                ).prefetch_related(
                    Prefetch(
                        "gameinfo_set",
                        queryset=Gameinfo.objects.order_by("scheduled"),
                    )
                ).order_by("date")

                gamedays_data = []
                for gd in gamedays_qs:
                    gamedays_data.append(
                        {
                            "id": gd.id,
                            "name": gd.name,
                            "date": str(gd.date),
                            "game_count": gd.gameinfo_set.count(),
                        }
                    )

                seasons_stats.append(
                    {
                        "season_id": season.pk,
                        "season_name": season.name,
                        "gamedays_count": gameday_count,
                        "avg_teams_per_gameday": round(
                            float(averages["avg_teams"] or 0), 1
                        ),
                        "avg_games_per_gameday": round(
                            float(averages["avg_games"] or 0), 1
                        ),
                        "gamedays": gamedays_data,
                    }
                )

            total_gamedays = Gameday.objects.filter(league=league).count()

            result.append(
                {
                    "league_id": league.pk,
                    "league_name": league.name,
                    "seasons_count": seasons_in_league.count(),
                    "total_gamedays": total_gamedays,
                    "seasons": seasons_stats,
                }
            )

        return result

    @staticmethod
    def get_teams_list() -> list:
        """Returns all non-dummy teams ordered by name."""
        return list(
            Team.objects.exclude(location='dummy')
            .values('id', 'name')
            .order_by('name')
        )

    @staticmethod
    def get_gameday_schedule() -> dict:
        """Returns gameday schedule data for the admin calendar view."""
        from django.utils.timezone import now as tz_now

        LIVE_STATUSES = ["Gestartet", "1. Halbzeit", "2. Halbzeit"]

        today = tz_now().date()

        gamedays = (
            Gameday.objects
            .select_related("league", "season")
            .annotate(
                is_live=Exists(
                    Gameinfo.objects.filter(
                        gameday=OuterRef("pk"),
                        status__in=LIVE_STATUSES,
                    )
                )
            )
            .order_by("date", "start")
        )

        gameday_list = []
        live_gameday = None
        next_gameday = None

        for gd in gamedays:
            entry = {
                "id": gd.pk,
                "name": gd.name,
                "date": str(gd.date),
                "start": str(gd.start) if gd.start else None,
                "league_name": gd.league.name if gd.league else None,
                "season_name": gd.season.name if gd.season else None,
                "status": gd.status,
                "is_live": gd.is_live,
            }
            gameday_list.append(entry)

            if gd.is_live and live_gameday is None:
                live_gameday = {
                    "id": gd.pk,
                    "name": gd.name,
                    "date": str(gd.date),
                }

            if next_gameday is None and not gd.is_live and gd.date >= today:
                next_gameday = {
                    "id": gd.pk,
                    "name": gd.name,
                    "date": str(gd.date),
                    "days_until": (gd.date - today).days,
                }

        return {
            "gamedays": gameday_list,
            "live_gameday": live_gameday,
            "next_gameday": next_gameday,
        }
