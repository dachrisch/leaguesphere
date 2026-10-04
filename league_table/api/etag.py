from django.db.models import Max, Q, Sum

from gamedays.models import Gameresult
from league_manager.utils.etag import build_etag
from league_table.models import LeagueSeasonConfig, TeamPointAdjustments


def standing_state_parts(configs):
    """Freshness parts per config: {config.pk: (config.pk, latest, sums...)}.

    Must change whenever a standing could change: a new, removed or edited
    game result for the league+season, or a manual point adjustment. Result
    value sums are included so in-place score edits invalidate the etag, not
    just new rows. Two grouped aggregate queries regardless of how many
    configs are passed (the snapshot's include=standings covers several).
    """
    configs = list(configs)
    if not configs:
        return {}

    pair_filter = Q()
    for config in configs:
        pair_filter |= Q(
            gameinfo__gameday__league_id=config.league_id,
            gameinfo__gameday__season_id=config.season_id,
        )
    results_by_pair = {
        (row["gameinfo__gameday__league"], row["gameinfo__gameday__season"]): row
        for row in Gameresult.objects.filter(pair_filter, gameinfo__status="beendet")
        .values("gameinfo__gameday__league", "gameinfo__gameday__season")
        .annotate(
            latest=Max("pk"),
            sum_fh=Sum("fh"),
            sum_sh=Sum("sh"),
            sum_pa=Sum("pa"),
        )
        .order_by()
    }
    adjustments_by_config = {
        row["league_season_config"]: row
        for row in TeamPointAdjustments.objects.filter(
            league_season_config__in=[config.pk for config in configs]
        )
        .values("league_season_config")
        .annotate(latest=Max("pk"), sum_points=Sum("sum_points"))
        .order_by()
    }

    parts = {}
    for config in configs:
        results = results_by_pair.get((config.league_id, config.season_id), {})
        adjustment = adjustments_by_config.get(config.pk, {})
        parts[config.pk] = (
            config.pk,
            results.get("latest"),
            results.get("sum_fh"),
            results.get("sum_sh"),
            results.get("sum_pa"),
            adjustment.get("latest"),
            adjustment.get("sum_points"),
        )
    return parts


def generate_etag(request, league=None, season=None):
    """ETag for the league table API.

    Config selection mirrors LeagueTableService.from_league_and_season
    (latest season when no season slug is given); unknown slugs return an
    unmatchable etag. Freshness parts: see standing_state_parts.
    """
    configs = LeagueSeasonConfig.objects.select_related("league", "season").filter(
        league__slug=league
    )
    if season is None:
        config = configs.order_by("season__pk").last()
    else:
        config = configs.filter(season__slug=season).first()

    if config is None:
        return '""'

    return build_etag(*standing_state_parts([config])[config.pk])
