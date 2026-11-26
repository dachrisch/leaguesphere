"""passcheck implementations of gamedays hooks (Phase 1, #2537).

Registered from ``PasscheckConfig.ready()``.
"""

from __future__ import annotations

import pandas as pd

from gamedays.service import registry
from django.db.models import Q

from gamedays.models import Gameresult

from passcheck.models import PasscheckVerification, PlayerlistGameday

JERSEY_KEY_MAPPING = {
    "gameday_id": "gameday_id",
    "gameday_jersey": "gameday_jersey",
    "playerlist__team_id": "team_id",
    "playerlist__player__person__first_name": "first_name",
    "playerlist__player__person__last_name": "last_name",
}

JERSEY_TYPES = {
    "gameday_id": int,
    "gameday_jersey": int,
    "team_id": int,
    "first_name": str,
    "last_name": str,
}

STAFF_COLUMNS = {
    "created_at": "Zeitpunkt",
    "official_name": "Schiedsrichter",
    "user__username": "Account",
    "team__description": "Team",
    "note": "Notiz",
}


def _jersey_frame(queryset):
    frame = pd.DataFrame(queryset.values(*JERSEY_KEY_MAPPING))
    if frame.empty:
        return frame
    return frame.rename(columns=JERSEY_KEY_MAPPING).astype(JERSEY_TYPES)


def player_jersey_names(gameday_id):
    return _jersey_frame(PlayerlistGameday.objects.filter(gameday_id=gameday_id))


def season_player_jersey_names(season_name):
    return _jersey_frame(
        PlayerlistGameday.objects.filter(gameday__season__name=season_name)
    )


def staff_passcheck_details(gameday_id):
    frame = pd.DataFrame(
        PasscheckVerification.objects.filter(gameday_id=gameday_id).values(
            *STAFF_COLUMNS
        )
    )
    if frame.empty:
        return pd.DataFrame([], columns=STAFF_COLUMNS.values())
    frame["created_at"] = frame.created_at.dt.strftime("%Y-%m-%d %H:%M:%S")
    frame["note"] = frame.note.apply(lambda value: value.replace("\n", "</br>"))
    return frame.rename(columns=STAFF_COLUMNS)


def annotate_passcheck(games, gameday_id):
    game_ids = [game["id"] for game in games]
    team_by_result = {
        str(result_id): team_id
        for result_id, team_id in Gameresult.objects.filter(
            gameinfo_id__in=game_ids
        ).values_list("id", "team_id")
    }
    verified = set(
        PasscheckVerification.objects.filter(gameday_id=gameday_id).values_list(
            "team_id", flat=True
        )
    )
    for game in games:
        home = team_by_result.get(str(game.get("id_home", "")))
        away = team_by_result.get(str(game.get("id_away", "")))
        game["passcheck"] = home in verified and away in verified


def verified_team_ids(gameday_id, team_ids=None):
    queryset = PasscheckVerification.objects.filter(gameday_id=gameday_id)
    if team_ids is not None:
        queryset = queryset.filter(team_id__in=team_ids)
    return set(queryset.values_list("team_id", flat=True))


def roster_rows(gameday_id, team_ids, joined_before):
    return list(
        PlayerlistGameday.objects.filter(
            gameday_id=gameday_id,
            playerlist__team_id__in=team_ids,
        )
        .filter(playerlist__joined_on__lte=joined_before)
        .filter(
            Q(playerlist__left_on__isnull=True)
            | Q(playerlist__left_on__gt=joined_before)
        )
        .select_related("playerlist__player__person")
    )


def register():
    for name, implementation in (
        ("annotate_passcheck", annotate_passcheck),
        ("verified_team_ids", verified_team_ids),
        ("roster_rows", roster_rows),
        ("player_jersey_names", player_jersey_names),
        ("season_player_jersey_names", season_player_jersey_names),
        ("staff_passcheck_details", staff_passcheck_details),
    ):
        registry.register(name, implementation, "passcheck")
