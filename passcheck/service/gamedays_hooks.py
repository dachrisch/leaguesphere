"""passcheck implementations of gamedays hooks (Phase 1, #2537).

Registered from ``PasscheckConfig.ready()``.
"""

from __future__ import annotations

import pandas as pd

from gamedays.service import registry
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


def register():
    for name, implementation in (
        ("player_jersey_names", player_jersey_names),
        ("season_player_jersey_names", season_player_jersey_names),
        ("staff_passcheck_details", staff_passcheck_details),
    ):
        registry.register(name, implementation, "passcheck")
