"""Gamedays-side access points for passcheck hooks (Phase 1, #2537)."""

from __future__ import annotations

from gamedays.service.registry import get


def player_jersey_names(gameday_id):
    return get("player_jersey_names")(gameday_id)


def season_player_jersey_names(season_name):
    return get("season_player_jersey_names")(season_name)


def staff_passcheck_details(gameday_id):
    return get("staff_passcheck_details")(gameday_id)


def annotate_passcheck(games, gameday_id):
    return get("annotate_passcheck")(games, gameday_id)


def verified_team_ids(gameday_id, team_ids=None):
    """``team_ids=None`` asks for every verified team in the gameday."""
    return get("verified_team_ids")(gameday_id, team_ids)


def roster_rows(gameday_id, team_ids, joined_before):
    return get("roster_rows")(gameday_id, team_ids, joined_before)
