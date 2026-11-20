from functools import wraps

from django.conf import settings
from django.core.cache import cache
from django.db.models import Count, Max, Min, Sum
from django.utils.cache import patch_response_headers
from django.utils.decorators import method_decorator
from django.views.decorators.http import condition
from rest_framework.response import Response
from rest_framework.views import APIView

from gameevents.models import GameState
from gamedays.models import Gameresult, Gameinfo, TeamLog
from league_manager.utils.etag import build_etag
from liveticker.service.liveticker_service import (
    LivetickerService,
    resolve_gameday_ids,
)


def parse_int_csv(input_value):
    if input_value is None:
        return []
    numbers_as_array = input_value.split(",")
    all_numbers_as_int = []
    for current_number in numbers_as_array:
        try:
            all_numbers_as_int += [int(current_number)]
        except ValueError:
            continue
    return all_numbers_as_int


def _request_selection(request):
    league = request.GET.get("league")
    league = [] if league is None or league == "" else league.split(",")
    return league, parse_int_csv(request.GET.get("gameday"))


def generate_liveticker_etag(request):
    """ETag for the liveticker response.

    The payload changes whenever a game result is written or edited (score
    updates patch existing rows in place, so value sums are included) or a
    new tick (TeamLog event) arrives. Query parameters and the resolved
    gameday ids are part of the key because league/gameday filters change the
    response body.

    Everything is scoped to the games this request can return. A row-by-row
    scan of every ``Gameinfo`` in the database made every poll read the whole
    table; one aggregate per model stays flat regardless of how many other
    gamedays or seasons exist. ``Gameinfo.updated_at`` covers the editable
    fields (kickoff, field, status, possession, halbzeit): saves go through
    ``BumpUpdatedAtOnSaveMixin`` and every ``QuerySet.update`` call site stamps
    it explicitly. Max/min/sum over ``scheduled``/``field`` additionally cover
    an older writer that skipped that stamp.

    With ``SCORECARD_EVENT_FEED`` on, the score also comes from ``GameState``,
    so the validator has to include the projection's cursor: an event that
    writes no ``TeamLog`` row (a plain possession change) would otherwise
    answer a stale ``304`` and the widget would keep the old state. The extra
    parts are added only when the flag is on.
    """
    etag_data = request.GET.urlencode() or "all"
    league, gameday_ids = _request_selection(request)
    gameday_ids = resolve_gameday_ids(gameday_ids, league)
    games = Gameinfo.objects.filter(gameday_id__in=gameday_ids).aggregate(
        count=Count("pk"),
        latest_update=Max("updated_at"),
        scheduled_max=Max("scheduled"),
        scheduled_min=Min("scheduled"),
        field_sum=Sum("field"),
        field_max=Max("field"),
    )
    results = Gameresult.objects.filter(gameinfo__gameday_id__in=gameday_ids).aggregate(
        count=Count("pk"),
        latest=Max("pk"),
        sum_fh=Sum("fh"),
        sum_sh=Sum("sh"),
    )
    ticks = TeamLog.objects.filter(gameinfo__gameday_id__in=gameday_ids).aggregate(
        count=Count("pk"), latest=Max("pk"), sum_value=Sum("value")
    )
    parts = [
        etag_data,
        ",".join(str(gameday_id) for gameday_id in sorted(gameday_ids)),
        games["count"],
        games["latest_update"],
        games["scheduled_max"],
        games["scheduled_min"],
        games["field_sum"],
        games["field_max"],
        results["count"],
        results["latest"],
        results["sum_fh"],
        results["sum_sh"],
        ticks["count"],
        ticks["latest"],
        ticks["sum_value"],
    ]
    if getattr(settings, "SCORECARD_EVENT_FEED", False):
        # last_seq is the cursor of the projection: every appended event
        # advances it. The score/period sums cover a rebuild that repairs a
        # drifted state without adding an event.
        projection = GameState.objects.filter(
            game__gameday_id__in=gameday_ids
        ).aggregate(
            count=Count("pk"),
            latest_seq=Max("last_seq"),
            sum_home=Sum("score_home"),
            sum_away=Sum("score_away"),
            latest_updated=Max("updated_at"),
        )
        parts += [
            projection["count"],
            projection["latest_seq"],
            projection["sum_home"],
            projection["sum_away"],
            projection["latest_updated"],
        ]
    etag = build_etag(*parts)
    # ``condition`` computed this before the view; reuse it as the cache key.
    request._liveticker_etag = etag
    return etag


def cache_liveticker(view):
    """Cache the response data under URL + current ETag.

    ``cache_page`` keyed only by URL, so a changed ETag still served the old
    body for the rest of the TTL. Caching under the ETag makes every client
    share one render per data version: a changed ETag is a new key and
    therefore fresh data immediately. Conditional requests no longer bypass
    the cache.
    """

    @wraps(view)
    def wrapped(request, *args, **kwargs):
        seconds = getattr(settings, "LIVETICKER_CACHE_SECONDS", 60)
        etag = getattr(request, "_liveticker_etag", None)
        cache_key = f"liveticker:{etag}" if etag else None
        if cache_key:
            cached = cache.get(cache_key)
            if cached is not None:
                response = Response(cached)
                patch_response_headers(response, seconds)
                return response
        response = view(request, *args, **kwargs)
        if cache_key and response.status_code == 200:
            cache.set(cache_key, response.data, seconds)
        patch_response_headers(response, seconds)
        return response

    return wrapped


class LivetickerAPIView(APIView):
    # condition sits outside the data cache: it computes the ETag once and
    # answers 304 on a match; on a mismatch the cache wrapper uses that same
    # ETag as its key.
    @method_decorator(condition(etag_func=generate_liveticker_etag))
    @method_decorator(cache_liveticker)
    def get(self, request):
        league, gameday_ids = _request_selection(request)
        games_with_all_ticks = self._parse_input(
            request.query_params.get("getAllTicksFor")
        )
        liveticker_service = LivetickerService(
            league,
            games_with_all_ticks,
            gameday_ids,
            all_results=request.query_params.get("results") == "all",
        )

        return Response(liveticker_service.get_liveticker_as_json())

    # noinspection PyMethodMayBeStatic
    def _parse_input(self, input_value):
        return parse_int_csv(input_value)
