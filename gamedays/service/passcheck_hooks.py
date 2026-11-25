"""Gamedays-side access points for passcheck hooks (Phase 1, #2537)."""

from __future__ import annotations

from gamedays.service.registry import get


def player_jersey_names(gameday_id):
    return get("player_jersey_names")(gameday_id)


def season_player_jersey_names(season_name):
    return get("season_player_jersey_names")(season_name)


def staff_passcheck_details(gameday_id):
    return get("staff_passcheck_details")(gameday_id)
