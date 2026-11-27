"""league_table implementations of gamedays hooks (Phase 1, #2537).

Registered from ``LeagueTableConfig.ready()``. The pandas wrappers stay in
gamedays; ruleset/config/engine resolution lives here.
"""

from __future__ import annotations

from django.db.models import Q
from django.urls import reverse

from gamedays.service import detail_context, registry
from league_table.api.etag import standing_state_parts as _standing_state_parts
from league_table.constants import (
    LEAGUE_TABLE_OVERALL_TABLE_BY_SLUG_AND_LEAGUE as _TABLE_URL,
)
from league_table.service.leaguetable_repository import LeagueTableRepository
from league_table.api.standings import build_standings as _build_standings
from league_table.models import LeagueGroup, LeagueRuleset, LeagueSeasonConfig
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


def group_options(ids):
    return list(LeagueGroup.objects.filter(id__in=ids).values_list("pk", "name"))


def group_by_id(pk):
    try:
        return LeagueGroup.objects.get(pk=pk)
    except LeagueGroup.DoesNotExist:
        return None


def register():
    detail_context.register_contributor("league_table", 10, detail_contributor)
    registry.register("group_options", group_options, "league_table")
    registry.register("group_by_id", group_by_id, "league_table")
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


def league_season_configs_for_pairs(pairs):
    """Build the Q here so gamedays never learns league_table's FK names."""
    pair_filter = Q()
    for league_id, season_id in pairs:
        pair_filter |= Q(league_id=league_id, season_id=season_id)
    return list(
        LeagueSeasonConfig.objects.filter(pair_filter)
        .select_related("league", "season")
        .order_by("season__name", "league__name", "pk")
    )


def standing_state_parts(configs):
    return _standing_state_parts(configs)


def build_standings(configs):
    return _build_standings(configs)


def detail_contributor(draft):
    from league_table.models import OverrideOfficialGamedaySetting

    gameday = draft.gameday
    try:
        draft.config = LeagueSeasonConfig.objects.get(
            league__name=gameday.league.name, season__name=gameday.season.name
        ).get_gameday_statistic_settings()
    except LeagueSeasonConfig.DoesNotExist:
        draft.config = {}

    from gamedays.service.builders import TableContextBuilder

    draft.qualify_table = TableContextBuilder.build(draft.qualify_table)
    draft.final_table = TableContextBuilder.build(draft.final_table)
    season_slug = gameday.season.slug
    league_slug = gameday.league.slug
    if season_slug and league_slug:
        draft.context["league_table_url"] = reverse(
            _TABLE_URL, kwargs={"season": season_slug, "league": league_slug}
        )
        try:
            config = LeagueTableRepository.get_league_season_config_by_slug(
                league_slug, season_slug
            )
            try:
                draft.allow_officials_to_register = (
                    config.overrideofficialgamedaysetting_set.get(
                        gameday=gameday
                    ).allow_officials_to_register
                )
            except OverrideOfficialGamedaySetting.DoesNotExist:
                draft.allow_officials_to_register = config.allow_officials_to_register
        except LeagueSeasonConfig.DoesNotExist:
            draft.allow_officials_to_register = False
