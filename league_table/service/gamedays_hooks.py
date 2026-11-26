"""league_table implementations of gamedays hooks (Phase 1, #2537).

Registered from ``LeagueTableConfig.ready()``. The pandas wrappers stay in
gamedays; ruleset/config/engine resolution lives here.
"""

from __future__ import annotations

from gamedays.service import registry
from league_table.api.etag import standing_state_parts as _standing_state_parts
from league_table.api.standings import build_standings as _build_standings
from league_table.models import LeagueRuleset, LeagueSeasonConfig
from league_table.service.datatypes import LeagueConfigRuleset
from league_table.service.leaguetable_settings import SHOW_PLAYER_NAMES, TOP_N_PLAYER
from league_table.service.ranking.engine import FinalRankingEngine, TieBreakerEngine


def season_settings(league, season):
    config = None
    ruleset = None
    try:
        config = LeagueSeasonConfig.objects.get(league=league, season=season)
        ruleset = config.ruleset
    except LeagueSeasonConfig.DoesNotExist:
        config = None
    except LeagueRuleset.DoesNotExist:
        try:
            ruleset = LeagueRuleset.objects.get(pk=2)
        except LeagueRuleset.DoesNotExist:
            ruleset = None
    return config, ruleset


def season_config(league_name, season_name):
    try:
        return LeagueSeasonConfig.objects.get(
            league__name=league_name, season__name=season_name
        )
    except LeagueSeasonConfig.DoesNotExist:
        return None


def rank_by_games(games, ruleset):
    engine = TieBreakerEngine(LeagueConfigRuleset.from_ruleset(ruleset))
    return engine.rank_by_games(games)


def compute_final_table(games, ruleset):
    engine = FinalRankingEngine(LeagueConfigRuleset.from_ruleset(ruleset))
    return engine.compute_final_table(games)


def gameday_statistic_settings(config):
    return config.get_gameday_statistic_settings()


def season_statistic_settings(config):
    return config.get_season_statistic_settings()


def show_player_names(settings):
    return settings.get(SHOW_PLAYER_NAMES, False)


def top_n_player(settings):
    return settings.get(TOP_N_PLAYER, 10)


def register():
    for name, implementation in (
        ("season_settings", season_settings),
        ("season_config", season_config),
        ("rank_by_games", rank_by_games),
        ("compute_final_table", compute_final_table),
        ("gameday_statistic_settings", gameday_statistic_settings),
        ("season_statistic_settings", season_statistic_settings),
        ("show_player_names", show_player_names),
        ("top_n_player", top_n_player),
        ("league_season_configs_for_pairs", league_season_configs_for_pairs),
        ("standing_state_parts", standing_state_parts),
        ("build_standings", build_standings),
    ):
        registry.register(name, implementation, "league_table")


def league_season_configs_for_pairs(pair_filter):
    return list(
        LeagueSeasonConfig.objects.filter(pair_filter)
        .select_related("league", "season")
        .order_by("season__name", "league__name", "pk")
    )


def standing_state_parts(configs):
    return _standing_state_parts(configs)


def build_standings(configs):
    return _build_standings(configs)
