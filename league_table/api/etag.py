from django.db.models import Max, Sum

from gamedays.models import Gameresult
from league_manager.utils.etag import build_etag
from league_table.models import LeagueSeasonConfig, TeamPointAdjustments


def generate_etag(request, league=None, season=None):
    """ETag for the league table API.

    Must change whenever the standing could change: a new, removed or edited
    game result for the league+season, or a manual point adjustment. Result
    value sums are included so in-place score edits invalidate the etag, not
    just new rows. Config selection mirrors
    LeagueTableService.from_league_and_season (latest season when no season
    slug is given); unknown slugs return an unmatchable etag.
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
    ).aggregate(
        latest=Max("pk"),
        sum_fh=Sum("fh"),
        sum_sh=Sum("sh"),
        sum_pa=Sum("pa"),
    )
    adjustment = TeamPointAdjustments.objects.filter(
        league_season_config=config
    ).aggregate(latest=Max("pk"), sum_points=Sum("sum_points"))

    return build_etag(
        config.pk,
        results["latest"],
        results["sum_fh"],
        results["sum_sh"],
        results["sum_pa"],
        adjustment["latest"],
        adjustment["sum_points"],
    )
