"""Gamedays-side access points for league_table hooks (Phase 1, #2537)."""

from __future__ import annotations

from gamedays.service.registry import get


def season_settings(league, season):
    return get("season_settings")(league, season)


def season_config(league_name, season_name):
    return get("season_config")(league_name, season_name)


def rank_by_games(games, ruleset):
    return get("rank_by_games")(games, ruleset)


def compute_final_table(games, ruleset):
    return get("compute_final_table")(games, ruleset)


def gameday_statistic_settings(config):
    return get("gameday_statistic_settings")(config)


def season_statistic_settings(config):
    return get("season_statistic_settings")(config)


def show_player_names(settings):
    return get("show_player_names")(settings)


def top_n_player(settings):
    return get("top_n_player")(settings)
