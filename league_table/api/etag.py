import hashlib

from django.db.models import Max

from league_table.models import LeagueSeasonConfig, TeamPointAdjustments
from gamedays.models import Gameresult


def generate_etag(request, league=None, season=None):
    """ETag for the league table API.

    Must change whenever the standing could change: a new/updated game result
    for the league+season, or a manual point adjustment. Config selection
    mirrors LeagueTableService.from_league_and_season (latest season when no
    season slug is given), and unknown slugs return an unmatchable etag.
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

    results = Gameresult.objects.filter(
        gameinfo__gameday__league=config.league,
        gameinfo__gameday__season=config.season,
        gameinfo__status="beendet",
    ).aggregate(results=Max("pk"))
    adjustment = TeamPointAdjustments.objects.filter(
        league_season_config=config
    ).aggregate(latest=Max("pk"))

    etag_data = (
        f"{config.pk}:{results['results']}:{adjustment['latest']}"
    )
    return f'"{hashlib.md5(etag_data.encode()).hexdigest()}"'
