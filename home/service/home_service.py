"""Assemble the personal home page context.

The only layer that touches the database: every card in ``cards.py`` is pure.
Queries are shaped so the page's query count does not grow with the number of
teams in a league (only the current user's team is read in detail).

Roles, in precedence order:

* ``team``     - the user belongs to a team (profile or team account)
* ``official`` - no team, but the Moodle officials session is present
  (``request.session["moodle_logged_in_user"]``; there is no User-Official
  relation in the schema)
* ``staff``    - ``is_staff`` without a team
* ``guest``    - everyone else

Nothing here is stored per user or per team: "since last gameday" is derived
from data every request.
"""

from datetime import timedelta
from urllib.parse import urlencode

from django.db.models import Count, Max, Q
from django.urls import reverse
from django.utils import timezone

from gamedays.constants import LEAGUE_GAMEDAY_CREATE, LEAGUE_GAMEDAY_LIST
from gamedays.models import (
    Gameday,
    Gameresult,
    Gameinfo,
    GameOfficial,
    Season,
    SeasonLeagueTeam,
    Team,
    TeamLog,
    UserProfile,
)
from gamedays.service.gamelog import SCORING_EVENTS
from gameday_designer.models import ScheduleTemplate
from league_table.constants import LEAGUE_TABLE_OVERALL_TABLE_BY_SLUG_AND_LEAGUE
from league_table.models import LeagueSeasonConfig
from league_table.service.league_table_service import LeagueTableService
from officials.models import Official, OfficialGamedaySignup
from officials.service.official_service import (
    LICENSE_LEVELS,
    bulk_history_by_official,
)
from officials.service.officials_compliance_service import (
    best_valid_rank,
    compute_gameday_officials_compliance,
)
from passcheck.models import EligibilityRule, Playerlist, PlayerlistTransfer

from .cards import (
    info_card,
    last_gameday_summary_card,
    next_gameday_card,
    officials_ready_card,
    official_licence_card,
    official_next_signup_card,
    official_open_results_card,
    pending_transfers_card,
    roster_checks_card,
    staff_gameday_nudge_card,
    staff_readiness_card,
    staff_review_card,
    table_delta_card,
)

DESIGNER_URL_NAME = "gameday_designer_app:index"
TEAMMANAGER_URL_NAME = "teammanager"
OFFICIALS_URL_NAME = "view-officials-list-for-all-teams"
HELP_URL_NAME = "help-index"
SEASON_LIST_URL_NAME = "league-season-list"

WEEKDAYS = ("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")


def _greeting(now) -> str:
    if now.hour < 11:
        return "Guten Morgen"
    if now.hour < 18:
        return "Guten Tag"
    return "Guten Abend"


def _profile_for_user(user):
    if not user.is_authenticated:
        return None
    return (
        UserProfile.objects.filter(user=user)
        .select_related("team")
        .order_by("pk")
        .first()
    )


def _display_name(user, profile):
    for candidate in (
        profile.firstname if profile is not None else None,
        user.first_name,
    ):
        if candidate and candidate.strip():
            return candidate.strip()
    return None


def _initials(user, profile, display_name) -> str:
    first = (profile.firstname if profile is not None else None) or user.first_name
    last = (profile.lastname if profile is not None else None) or user.last_name
    if first and last:
        return f"{first[0]}{last[0]}".upper()
    if display_name:
        return display_name[:2].upper()
    return user.username[:2].upper()


def _avatar(profile, team, user, display_name) -> dict:
    """Prefer the person's avatar, then the team's logo, then initials."""
    if profile is not None and profile.avatar:
        return {"kind": "image", "url": profile.avatar.url, "initials": ""}
    if team is not None and team.logo:
        return {"kind": "team_logo", "url": team.logo.url, "initials": ""}
    return {
        "kind": "initials",
        "url": None,
        "initials": _initials(user, profile, display_name),
    }


def _table_url(membership) -> str | None:
    if not membership:
        return None
    return reverse(
        LEAGUE_TABLE_OVERALL_TABLE_BY_SLUG_AND_LEAGUE,
        kwargs={
            "league": membership["league__slug"],
            "season": membership["season__slug"],
        },
    )


def _sections(*, table_url=None, is_staff=False) -> list:
    """Quiet links into the rest of the site - this page is the landing page."""
    sections = [{"label": "Spieltage", "url": reverse(LEAGUE_GAMEDAY_LIST)}]
    if table_url is not None:
        sections.append({"label": "Ligen & Tabellen", "url": table_url})
    sections.extend(
        [
            {"label": "Offizielle", "url": reverse(OFFICIALS_URL_NAME)},
            {"label": "Team", "url": reverse(TEAMMANAGER_URL_NAME)},
        ]
    )
    if is_staff:
        sections.append({"label": "Saisons", "url": reverse(SEASON_LIST_URL_NAME)})
    sections.append({"label": "Hilfe", "url": reverse(HELP_URL_NAME)})
    return sections


def designer_url(*, season_id=None, league_id=None) -> str:
    """Designer URL carrying the season/league the gameday is meant for.

    The designer honours ``?season=<id>&league=<id>`` when creating a gameday;
    without them it falls back to the first entry of its own lists.
    """
    base = reverse(DESIGNER_URL_NAME)
    params = {}
    if season_id is not None:
        params["season"] = season_id
    if league_id is not None:
        params["league"] = league_id
    return f"{base}?{urlencode(params)}" if params else base


def team_for_user(user):
    """The team this user manages, if any.

    ``UserProfile.user`` is a foreign key (several profiles per user are
    possible), so the lowest pk wins; the ``Team.name == username`` team-account
    convention used by ``PermissionHelper`` is the fallback.
    """
    if not user.is_authenticated:
        return None

    profile = _profile_for_user(user)
    if profile is not None and profile.team_id is not None:
        return profile.team
    return Team.objects.filter(name=user.username).first()


def build_context(user, *, official_id=None, today=None, now=None) -> dict:
    today = today or timezone.localdate()
    now = now or timezone.localtime()

    profile = _profile_for_user(user)
    team = None
    if profile is not None and profile.team_id is not None:
        team = profile.team
    elif user.is_authenticated:
        team = Team.objects.filter(name=user.username).first()

    if team is not None:
        context = _team_context(team, today)
        role = "team"
    elif official_id is not None:
        context = _official_context(official_id, today)
        role = "official"
    elif user.is_staff:
        context = _staff_context(today)
        role = "staff"
    else:
        context = _guest_context()
        role = "guest"

    table_url = context.pop("table_url", None)

    display_name = _display_name(user, profile)
    greeting = _greeting(now)
    context.update(
        role=role,
        today=today,
        greeting=greeting,
        display_name=display_name,
        heading=f"{greeting}, {display_name}" if display_name else greeting,
        date_text=f"{WEEKDAYS[today.weekday()]}, {today.strftime('%d.%m.%Y')}",
        avatar=_avatar(profile, team, user, display_name),
        sections=_sections(table_url=table_url, is_staff=user.is_staff),
    )
    return context


# --------------------------------------------------------------------------- #
# team
# --------------------------------------------------------------------------- #
def _memberships(team):
    return list(
        SeasonLeagueTeam.objects.filter(teams=team)
        .select_related("league", "season")
        .order_by("season__name", "league__name")
        .values(
            "league_id",
            "season_id",
            "league__name",
            "league__slug",
            "season__name",
            "season__slug",
        )
    )


def _team_context(team, today) -> dict:
    memberships = _memberships(team)
    league_ids = {membership["league_id"] for membership in memberships}
    season_ids = {membership["season_id"] for membership in memberships}

    upcoming = None
    if league_ids:
        upcoming = (
            Gameday.objects.filter(
                date__gte=today,
                league_id__in=league_ids,
                season_id__in=season_ids,
            )
            .select_related("league", "season")
            .order_by("date", "start")
            .first()
        )

    cards = []
    if upcoming is not None:
        games = _games_for_team(upcoming, team)
        cards.append(next_gameday_card(upcoming, games=games, today=today))
        cards.append(_roster_card(team, memberships))
        transfer_card = _pending_transfers_card(team)
        if transfer_card is not None:
            cards.append(transfer_card)
        cards.append(
            officials_ready_card(
                GameOfficial.objects.filter(gameinfo__gameday=upcoming).count()
            )
        )
    else:
        cards.append(_season_break_card(team, memberships, today))

    last_result = (
        Gameresult.objects.filter(team=team, gameinfo__gameday__date__lt=today)
        .select_related("gameinfo", "gameinfo__gameday")
        .order_by("-gameinfo__gameday__date", "-pk")
        .first()
    )
    if last_result is not None:
        opponent = _opponent_for(last_result, team)
        cards.append(
            last_gameday_summary_card(
                gameday=last_result.gameinfo.gameday,
                own_score=_score_of(last_result),
                opponent_score=last_result.pa,
                opponent=opponent.description if opponent is not None else None,
                moments=_scoring_moments(last_result.gameinfo_id, team),
            )
        )
        delta = _table_delta(team, memberships, last_result.gameinfo.gameday.date)
        if delta is not None:
            cards.append(delta)

    league_name = memberships[0]["league__name"] if memberships else None
    season_name = memberships[0]["season__name"] if memberships else None
    context_parts = [part for part in (league_name, _season_text(season_name)) if part]

    return {
        "team": team,
        "role_text": f"Teamverantwortlich für {team.description}",
        "context_text": " · ".join(context_parts) or None,
        "table_url": _table_url(memberships[0] if memberships else None),
        "cards": [card for card in cards if card is not None],
    }


def _season_text(season_name):
    return f"Saison {season_name}" if season_name else None


def _games_for_team(gameday, team) -> list:
    games = list(
        Gameinfo.objects.filter(gameday=gameday, gameresult__team=team)
        .distinct()
        .order_by("scheduled", "field")
    )
    previous_scores = _previous_scores(team, gameday.date)

    rows = []
    for game in games:
        opponent = _opponent_for(game, team)
        rows.append(
            {
                "scheduled": game.scheduled,
                "field": game.field,
                "opponent": opponent.description if opponent is not None else "?",
                "previous_score": (
                    previous_scores.get(opponent.pk) if opponent else None
                ),
            }
        )
    return rows


def _opponent_for(result_or_game, team):
    if isinstance(result_or_game, Gameresult):
        gameinfo_id = result_or_game.gameinfo_id
    else:
        gameinfo_id = result_or_game.pk
    row = (
        Gameresult.objects.filter(gameinfo_id=gameinfo_id, team__isnull=False)
        .exclude(team=team)
        .select_related("team")
        .first()
    )
    return row.team if row is not None else None


def _score_of(result):
    if result.fh is None and result.sh is None:
        return None
    return (result.fh or 0) + (result.sh or 0)


def _previous_scores(team, before) -> dict:
    """Most recent result per opponent before ``before`` (two queries)."""
    rows = list(
        Gameresult.objects.filter(team=team, gameinfo__gameday__date__lt=before)
        .select_related("gameinfo")
        .order_by("-gameinfo__gameday__date", "-pk")
    )
    if not rows:
        return {}

    opponents = {
        row.gameinfo_id: row.team
        for row in Gameresult.objects.filter(
            gameinfo_id__in=[row.gameinfo_id for row in rows], team__isnull=False
        )
        .exclude(team=team)
        .select_related("team")
    }

    scores = {}
    for row in rows:
        opponent = opponents.get(row.gameinfo_id)
        if opponent is None or opponent.pk in scores:
            continue
        own = _score_of(row)
        if own is None or row.pa is None:
            continue
        scores[opponent.pk] = f"Hinspiel {own}:{row.pa}"
    return scores


def _roster_card(team, memberships):
    active = Playerlist.objects.filter(team=team, left_on__isnull=True)
    minimum = None
    if memberships:
        minimum = EligibilityRule.objects.filter(
            eligible_in__id__in=[membership["league_id"] for membership in memberships]
        ).aggregate(strictest=Max("minimum_player_strength"))["strictest"]

    return roster_checks_card(
        active_players=active.count(),
        players_without_jersey=active.filter(jersey_number__isnull=True).count(),
        minimum_player_strength=minimum,
    )


def _pending_transfers_card(team):
    transfers = list(
        PlayerlistTransfer.objects.filter(new_team=team, status="pending")
        .select_related("current_team__player__person")
        .order_by("created_at")
    )
    rows = []
    for transfer in transfers:
        person = transfer.current_team.player.person
        rows.append(
            {
                "player_name": f"{person.first_name[0]}. {person.last_name}".strip(),
                "since": transfer.created_at.date(),
            }
        )
    return pending_transfers_card(rows)


def _scoring_moments(gameinfo_id, team) -> list:
    return list(
        TeamLog.objects.filter(
            gameinfo_id=gameinfo_id,
            team=team,
            isDeleted=False,
            event__in=SCORING_EVENTS,
        )
        .values("event", "player")
        .annotate(count=Count("pk"))
        .order_by("-count", "event", "player")
    )


def _table_delta(team, memberships, last_gameday_date):
    if not memberships:
        return None

    membership = memberships[0]
    config = LeagueSeasonConfig.objects.filter(
        league_id=membership["league_id"], season_id=membership["season_id"]
    ).first()
    if config is None:
        return None

    service = LeagueTableService(config)
    current = _rank_of(service.get_standing(), team.pk)
    previous = _rank_of(
        service.get_standing(until_date=last_gameday_date - timedelta(days=1)),
        team.pk,
    )
    return table_delta_card(previous_rank=previous, current_rank=current)


def _rank_of(table, team_pk):
    if table is None or getattr(table, "empty", True):
        return None
    rows = table[table["team_id"] == team_pk]
    if rows.empty:
        return None
    try:
        return int(rows.iloc[0]["rank"])
    except (TypeError, ValueError):
        return None


def _season_break_card(team, memberships, today):
    season_name = memberships[0]["season__name"] if memberships else None
    reason = (
        f"Für die Saison {season_name} ist noch kein Spielplan veröffentlicht."
        if season_name
        else "Für dieses Team ist noch keine Liga eingetragen."
    )
    return info_card(
        "season_break",
        "Keine Spieltage geplant",
        f"{reason} Kein Spieltag mit Datum ab heute.",
        links=[
            {
                "label": "Jetzt sinnvoll: Kader prüfen",
                "url": reverse("league-gameday-list"),
            },
            {"label": "Alle Spieltage", "url": reverse("league-gameday-list")},
        ],
    )


# --------------------------------------------------------------------------- #
# official
# --------------------------------------------------------------------------- #
def _official_context(official_id, today) -> dict:
    official = Official.objects.filter(pk=official_id).first()
    if official is None:
        return _guest_context()

    signups = OfficialGamedaySignup.objects.filter(official_id=official_id)
    next_signup = (
        signups.filter(gameday__date__gte=today)
        .select_related("gameday")
        .order_by("gameday__date")
        .first()
    )

    signup_data = None
    if next_signup is not None:
        signup_data = {
            "gameday": next_signup.gameday.name,
            "date": next_signup.gameday.date,
            "games": Gameinfo.objects.filter(gameday=next_signup.gameday).count(),
        }
    signup_card = official_next_signup_card(signup_data)

    open_games = list(
        Gameinfo.objects.filter(
            gameday_id__in=signups.values("gameday_id"),
            status=Gameinfo.STATUS_COMPLETED,
            gameresult__isnull=True,
        )
        .values("gameday__name", "field")
        .annotate(count=Count("pk"))
        .order_by("gameday__name")
    )
    open_results_card = official_open_results_card(
        [
            {
                "gameday": row["gameday__name"],
                "field": row["field"],
                "count": row["count"],
            }
            for row in open_games
        ]
    )

    history = bulk_history_by_official([official_id]).get(official_id, [])
    rank = best_valid_rank(history, today)
    licence_name = LICENSE_LEVELS[rank] if rank is not None else None

    cards = [
        card
        for card in (
            signup_card,
            official_licence_card(licence_name),
            open_results_card,
        )
        if card is not None
    ]

    return {
        "official": official,
        "role_text": "Schiedsrichter:in · keinem Team zugeordnet",
        "context_text": None,
        "cards": cards,
    }


# --------------------------------------------------------------------------- #
# staff
# --------------------------------------------------------------------------- #
def _staff_context(today) -> dict:
    latest = (
        Gameday.objects.select_related("league", "season")
        .order_by("-date", "-pk")
        .first()
    )
    if latest is None:
        return {
            "role_text": "Liga-Verwaltung",
            "context_text": None,
            "cards": [
                info_card(
                    "staff_empty",
                    "Noch keine Saison und kein Spieltag",
                    "Lege zuerst eine Saison an, dann einen Spieltag.",
                    links=[
                        {
                            "label": "Saison anlegen",
                            "url": reverse("league-season-create"),
                        },
                        {
                            "label": "Aus Vorlage anwenden",
                            "url": reverse(DESIGNER_URL_NAME),
                        },
                    ],
                )
            ],
        }

    league = latest.league
    upcoming = (
        Gameday.objects.filter(league=league, date__gte=today)
        .order_by("date", "start")
        .first()
    )

    if upcoming is not None:
        cards = [
            _readiness_card(upcoming, league, today),
            _review_card(upcoming.season, today),
        ]
    else:
        next_season = (
            Season.objects.filter(name__gt=latest.season.name).order_by("-name").first()
        )
        cards = [
            staff_gameday_nudge_card(
                league=league.name,
                season=next_season,
                has_template=ScheduleTemplate.objects.exists(),
                last_gameday_date=latest.date,
                today=today,
                has_upcoming_gameday=False,
                season_url=reverse("league-season-create"),
                designer_url=designer_url(
                    season_id=next_season.pk if next_season else None,
                    league_id=league.pk,
                ),
                gameday_create_url=reverse(LEAGUE_GAMEDAY_CREATE),
            ),
            _review_card(latest.season, today),
        ]

    return {
        "role_text": "Liga-Verwaltung",
        "context_text": f"{league.name} · Saison {latest.season.name}",
        "table_url": reverse(
            LEAGUE_TABLE_OVERALL_TABLE_BY_SLUG_AND_LEAGUE,
            kwargs={"league": league.slug, "season": latest.season.slug},
        ),
        "cards": [card for card in cards if card is not None],
    }


def _review_card(season, today):
    """One card for the past: the season and how its last gameday went."""
    season_stats = Gameday.objects.filter(season=season).aggregate(
        total=Count("pk"),
        upcoming=Count("pk", filter=Q(date__gte=today)),
    )
    memberships = SeasonLeagueTeam.objects.filter(season=season).aggregate(
        leagues=Count("league_id", distinct=True),
        teams=Count("teams", distinct=True),
    )

    last_gameday = (
        Gameday.objects.filter(season=season, date__lt=today)
        .order_by("-date", "-pk")
        .first()
    )
    games = {"total": 0, "with_results": 0}
    if last_gameday is not None:
        games = Gameinfo.objects.filter(gameday=last_gameday).aggregate(
            total=Count("pk", distinct=True),
            with_results=Count("pk", filter=Q(gameresult__isnull=False), distinct=True),
        )

    return staff_review_card(
        season_name=season.name,
        gameday_count=season_stats["total"],
        is_finished=season_stats["upcoming"] == 0,
        team_count=memberships["teams"],
        league_count=memberships["leagues"],
        last_gameday_name=last_gameday.name if last_gameday else None,
        last_gameday_date=last_gameday.date if last_gameday else None,
        today=today,
        games_total=games["total"],
        games_with_results=games["with_results"],
    )


def _readiness_card(gameday, league, today):
    status = compute_gameday_officials_compliance([gameday.pk])[gameday.pk]
    draft_gamedays = list(
        Gameday.objects.filter(
            league=league,
            date__gte=today,
            status=Gameday.STATUS_DRAFT,
        ).values_list("name", flat=True)
    )
    return staff_readiness_card(
        gameday=gameday,
        game_count=Gameinfo.objects.filter(gameday=gameday).count(),
        officials_assigned=GameOfficial.objects.filter(
            gameinfo__gameday=gameday
        ).count(),
        understaffed_games=status.violation_count if status.is_checked else 0,
        draft_gamedays=draft_gamedays,
        expiring_licences=_expiring_licences(gameday, today),
    )


def _expiring_licences(gameday, today) -> int:
    official_ids = list(
        GameOfficial.objects.filter(
            gameinfo__gameday=gameday, official__isnull=False
        ).values_list("official_id", flat=True)
    )
    history = bulk_history_by_official(official_ids)
    expiring = 0
    for entries in history.values():
        valid_now = best_valid_rank(entries, today)
        valid_on_gameday = best_valid_rank(entries, gameday.date)
        if valid_now is not None and valid_on_gameday is None:
            expiring += 1
    return expiring


# --------------------------------------------------------------------------- #
# guest
# --------------------------------------------------------------------------- #
def _guest_context() -> dict:
    return {
        "role_text": "Deinem Konto ist noch kein Team zugeordnet",
        "context_text": None,
        "cards": [
            info_card(
                "guest",
                "Nichts zu tun",
                "Deinem Konto ist kein Team zugeordnet. Spieltage und Tabellen "
                "sind trotzdem offen.",
                links=[
                    {"label": "Spieltage", "url": reverse("league-gameday-list")},
                    {
                        "label": "Offizielle",
                        "url": reverse("view-officials-list-for-all-teams"),
                    },
                ],
            )
        ],
    }
